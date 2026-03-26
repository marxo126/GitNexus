/**
 * Resolves custom React components to the native DOM elements they render.
 * Uses the already-extracted JSX elements grouped by enclosingFunction.
 */

import type { ExtractedJSXElement } from './types.js';

/** Native HTML elements (lowercase) */
function isNativeElement(tag: string): boolean {
  return /^[a-z]/.test(tag);
}

/**
 * Known accessible third-party components.
 * These are in node_modules and can't be traced, but we know what they render.
 */
export const KNOWN_ACCESSIBLE_COMPONENTS = new Set([
  // Radix UI primitives -- all internally accessible
  'Dialog', 'DialogContent', 'DialogTrigger', 'DialogOverlay',
  'Select', 'SelectTrigger', 'SelectContent', 'SelectItem',
  'DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent', 'DropdownMenuItem',
  'Popover', 'PopoverTrigger', 'PopoverContent',
  'Tooltip', 'TooltipTrigger', 'TooltipContent',
  'Tabs', 'TabsList', 'TabsTrigger', 'TabsContent',
  'Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent',
  'AlertDialog', 'AlertDialogTrigger', 'AlertDialogContent', 'AlertDialogPrimitive',
  'Toast', 'ToastPrimitive', 'ToastViewport',
  'Checkbox', 'RadioGroup', 'RadioGroupItem',
  'Switch', 'Slider', 'Toggle', 'ToggleGroup',
  'NavigationMenu', 'NavigationMenuTrigger', 'NavigationMenuContent',
  // shadcn/ui specific wrappers
  'Button', 'Input', 'Label', 'Textarea', 'FormField', 'FormItem', 'FormLabel', 'FormControl',
  'Card', 'Badge', 'Avatar',
]);

/**
 * Check if a component is a known accessible third-party component.
 * Elements inside these components should not be flagged for keyboard/role issues.
 */
export function isKnownAccessibleComponent(tag: string): boolean {
  // Check exact match
  if (KNOWN_ACCESSIBLE_COMPONENTS.has(tag)) return true;
  // Check dotted names like Dialog.Content
  const parts = tag.split('.');
  if (parts.length > 1 && KNOWN_ACCESSIBLE_COMPONENTS.has(parts.join(''))) return true;
  if (parts.length > 1 && KNOWN_ACCESSIBLE_COMPONENTS.has(parts[0])) return true;
  return false;
}

/** Build a map of componentName -> elements it renders */
export function buildComponentMap(
  allElements: ExtractedJSXElement[],
): Map<string, ExtractedJSXElement[]> {
  const map = new Map<string, ExtractedJSXElement[]>();
  for (const el of allElements) {
    const fn = el.enclosingFunction;
    if (!fn || fn === '<module>' || fn === '<anonymous>') continue;
    const arr = map.get(fn) || [];
    arr.push(el);
    map.set(fn, arr);
  }
  return map;
}

/**
 * Resolve a custom component to the native DOM elements it ultimately renders.
 * Follows PascalCase component references recursively up to maxDepth.
 */
export function resolveComponent(
  componentName: string,
  componentMap: Map<string, ExtractedJSXElement[]>,
  maxDepth: number = 5,
  visited: Set<string> = new Set(),
): ExtractedJSXElement[] {
  if (visited.has(componentName) || maxDepth <= 0) return [];
  visited.add(componentName);

  const elements = componentMap.get(componentName);
  if (!elements) return [];

  const resolved: ExtractedJSXElement[] = [];
  for (const el of elements) {
    if (isNativeElement(el.tag)) {
      resolved.push(el);
    } else {
      // PascalCase component -- resolve recursively
      const inner = resolveComponent(el.tag, componentMap, maxDepth - 1, visited);
      resolved.push(...inner);
    }
  }
  return resolved;
}

/**
 * For each file's elements, resolve custom component usages to native elements.
 * Returns enhanced element list where PascalCase components are augmented with
 * their resolved native children.
 *
 * This does NOT replace the original elements -- it adds resolution context
 * so rules can check what a custom component actually renders.
 */
export function resolveComponentsInFile(
  fileElements: ExtractedJSXElement[],
  componentMap: Map<string, ExtractedJSXElement[]>,
): ExtractedJSXElement[] {
  const resolved: ExtractedJSXElement[] = [];

  for (const el of fileElements) {
    // Always keep the original element
    resolved.push(el);

    // If it's a custom component, also add the native elements it renders
    // (with the original element's filePath and lineNumber for error reporting)
    if (!isNativeElement(el.tag)) {
      const nativeChildren = resolveComponent(el.tag, componentMap);
      for (const child of nativeChildren) {
        // Merge usage-site props onto resolved native element
        // Usage-site props (el.attributes) override internal props (child.attributes)
        // Only propagate a11y-relevant attributes from usage site to resolved element.
        // Event handlers (onClick, onChange, etc.) must NOT propagate — they cause
        // false positives when keyboard/nameRoleValue rules see onClick on resolved divs.
        const A11Y_PROPS = new Set([
          'id', 'htmlFor', 'for', 'role', 'tabIndex',
          'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
          'aria-live', 'aria-expanded', 'aria-selected', 'aria-checked',
          'aria-controls', 'aria-haspopup', 'aria-modal', 'aria-disabled',
          'aria-required', 'aria-invalid', 'aria-errormessage',
          'alt', 'title', 'lang', 'type', 'autocomplete', 'placeholder',
        ]);
        const mergedAttrs = new Map(child.attributes);
        for (const [key, value] of el.attributes) {
          if (A11Y_PROPS.has(key)) mergedAttrs.set(key, value);
        }

        // Create a "virtual" element: native tag from the component's internals,
        // but attributed to the usage site (where the component is used)
        resolved.push({
          ...child,
          attributes: mergedAttrs,
          filePath: el.filePath,
          lineNumber: el.lineNumber,
          enclosingFunction: el.enclosingFunction,
          // Mark as resolved so rules know this came from component resolution
          parentTag: el.tag, // the custom component that renders this
          resolved: true, // flag for effectiveStatus() — resolved elements never produce violations
          // Also merge classNames if both have them
          classNames: [...(child.classNames || []), ...(el.classNames || [])],
        });
      }
    }
  }

  return resolved;
}
