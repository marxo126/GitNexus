import { describe, it, expect } from 'vitest';
import { detectSwrSlots } from '../../src/core/ingestion/state-slot-detectors/swr.js';
import { detectReactQuerySlots } from '../../src/core/ingestion/state-slot-detectors/react-query.js';
import { detectQueryClientSlots } from '../../src/core/ingestion/state-slot-detectors/query-client.js';
import { detectCustomHookSlots } from '../../src/core/ingestion/state-slot-detectors/custom-hook.js';
import { detectGraphQLSlots } from '../../src/core/ingestion/state-slot-detectors/graphql.js';
import { detectTRPCSlots } from '../../src/core/ingestion/state-slot-detectors/trpc.js';
import { detectReactContextSlots } from '../../src/core/ingestion/state-slot-detectors/react-context.js';
import { detectReduxSlots } from '../../src/core/ingestion/state-slot-detectors/redux.js';
import { detectZustandSlots } from '../../src/core/ingestion/state-slot-detectors/zustand.js';

describe('state-slot-detectors', () => {
  describe('detectSwrSlots', () => {
    it('detects useSWR with string key', () => {
      const code = `
        function VendorDetail({ id }) {
          const { data, error } = useSWR('/api/vendors/' + id, fetcher);
          return <div>{data?.name}</div>;
        }
      `;
      const slots = detectSwrSlots(code, '/src/components/VendorDetail.tsx');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('swr');
      expect(slots[0].cacheKey).toBe("'/api/vendors/' + id");
      expect(slots[0].filePath).toBe('/src/components/VendorDetail.tsx');
      expect(slots[0].lineNumber).toBeGreaterThan(0);
    });

    it('detects useSWR with array key', () => {
      const code = `
        function useVendor(id) {
          const { data } = useSWR(['vendors', id], fetchVendor);
          return data;
        }
      `;
      const slots = detectSwrSlots(code, '/src/hooks/useVendor.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('swr');
      expect(slots[0].cacheKey).toBe("['vendors', id]");
      expect(slots[0].name).toBe("['vendors', id]");
    });

    it('detects useSWRMutation', () => {
      const code = `
        function useUpdateVendor() {
          const { trigger, isMutating } = useSWRMutation('/api/vendors', updateVendor);
          return { trigger, isMutating };
        }
      `;
      const slots = detectSwrSlots(code, '/src/hooks/useUpdateVendor.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('swr');
      expect(slots[0].cacheKey).toBe("'/api/vendors'");
    });

    it('returns empty for files without SWR', () => {
      const code = `
        function MyComponent() {
          const [state, setState] = useState(null);
          useEffect(() => { setState('hello'); }, []);
          return <div>{state}</div>;
        }
      `;
      const slots = detectSwrSlots(code, '/src/components/MyComponent.tsx');
      expect(slots).toHaveLength(0);
    });

    it('extracts consumer access patterns from context window', () => {
      const code = `
        function VendorList() {
          const { data } = useSWR('/api/vendors', fetcher);
          return (
            <ul>
              {data?.items.map(v => <li key={v.id}>{v.name}</li>)}
              <span>Total: {data?.total}</span>
            </ul>
          );
        }
      `;
      const slots = detectSwrSlots(code, '/src/components/VendorList.tsx');
      expect(slots).toHaveLength(1);
      // Consumer access keys should be detected from the context window
      const consumers = slots[0].consumers;
      expect(consumers.length).toBeGreaterThan(0);
      expect(consumers[0].accessedKeys).toContain('items');
      expect(consumers[0].accessedKeys).toContain('total');
    });

    it('detects multiple SWR calls in same file', () => {
      const code = `
        function useData() {
          const { data: vendors } = useSWR('/api/vendors', fetchVendors);
          const { data: grants } = useSWR('/api/grants', fetchGrants);
          return { vendors, grants };
        }
      `;
      const slots = detectSwrSlots(code, '/src/hooks/useData.ts');
      expect(slots).toHaveLength(2);
      const keys = slots.map(s => s.cacheKey);
      expect(keys).toContain("'/api/vendors'");
      expect(keys).toContain("'/api/grants'");
    });

    it('detects useSWR with template literal key', () => {
      const code = `
        function useVendorById(id) {
          const { data } = useSWR(\`/api/vendors/\${id}\`, fetcher);
          return data;
        }
      `;
      const slots = detectSwrSlots(code, '/src/hooks/useVendorById.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe('`/api/vendors/${id}`');
    });
  });

  describe('detectReactQuerySlots', () => {
    const FILE_PATH = '/project/src/hooks/useVendors.ts';

    it('detects useQuery with array queryKey', () => {
      const source = `
        export function useVendorPatterns(slug: string) {
          return useQuery({
            queryKey: ['vendor-patterns', slug],
            queryFn: () => fetchVendorPatterns(slug),
          });
        }
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('react-query');
      expect(slots[0].cacheKey).toBe(`['vendor-patterns', slug]`);
      expect(slots[0].name).toBe(`['vendor-patterns', slug]`);
      expect(slots[0].filePath).toBe(FILE_PATH);
      expect(slots[0].lineNumber).toBeGreaterThan(0);
    });

    it('detects multiple useQuery calls in same file', () => {
      const source = `
        export function useVendors() {
          return useQuery({
            queryKey: ['vendors-list'],
            queryFn: fetchVendors,
          });
        }

        export function useVendorDetail(id: string) {
          return useQuery({
            queryKey: ['vendor-detail', id],
            queryFn: () => fetchVendorDetail(id),
          });
        }
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(2);
      const keys = slots.map((s) => s.cacheKey);
      expect(keys).toContain(`['vendors-list']`);
      expect(keys).toContain(`['vendor-detail', id]`);
    });

    it('detects useMutation with mutationKey', () => {
      const source = `
        export function useUpdateVendor() {
          return useMutation({
            mutationKey: ['update-vendor'],
            mutationFn: (data: VendorInput) => updateVendor(data),
          });
        }
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('react-query');
      expect(slots[0].cacheKey).toBe(`['update-vendor']`);
    });

    it('detects useInfiniteQuery', () => {
      const source = `
        export function useVendorsPaged() {
          return useInfiniteQuery({
            queryKey: ['vendors-paged'],
            queryFn: ({ pageParam }) => fetchVendorsPage(pageParam),
            getNextPageParam: (last) => last.nextCursor,
          });
        }
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('react-query');
      expect(slots[0].cacheKey).toBe(`['vendors-paged']`);
    });

    it('detects useSuspenseQuery', () => {
      const source = `
        export function useVendorSuspense(id: string) {
          return useSuspenseQuery({
            queryKey: ['vendor-suspense', id],
            queryFn: () => fetchVendor(id),
          });
        }
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('react-query');
      expect(slots[0].cacheKey).toBe(`['vendor-suspense', id]`);
    });

    it('returns empty array for files without React Query hooks', () => {
      const source = `
        export function fetchVendors() {
          return fetch('/api/vendors').then((r) => r.json());
        }

        const data = useState(null);
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(0);
    });

    it('extracts consumer accessed keys from destructuring', () => {
      const source = `
        export function VendorList() {
          const { data, isLoading, error } = useQuery({
            queryKey: ['vendor-list'],
            queryFn: fetchVendors,
          });
          const { patterns, total } = data ?? {};
          return <div>{total}</div>;
        }
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(1);
      const consumer = slots[0].consumers[0];
      expect(consumer).toBeDefined();
      expect(consumer.accessedKeys).toContain('patterns');
      expect(consumer.accessedKeys).toContain('total');
    });

    it('extracts consumer accessed keys from property access', () => {
      // Uses `data.name` so that extractPropertyAccessKeys matches `data` as the var name
      // and captures `name` as the accessed key (shape-inference only tracks known var names)
      const source = `
        export function VendorDetail({ id }: { id: string }) {
          const { data } = useQuery({
            queryKey: ['vendor-detail', id],
            queryFn: () => fetchVendor(id),
          });
          return <h1>{data?.name}</h1>;
        }
      `;
      const slots = detectReactQuerySlots(source, FILE_PATH);
      expect(slots).toHaveLength(1);
      const consumer = slots[0].consumers[0];
      expect(consumer).toBeDefined();
      expect(consumer.accessedKeys).toContain('name');
    });
  });

  describe('detectQueryClientSlots', () => {
    it('detects setQueryData with array key', () => {
      const code = `
        function invalidateVendors(queryClient, newData) {
          queryClient.setQueryData(['vendor-patterns', slug], newData);
        }
      `;
      const slots = detectQueryClientSlots(code, 'utils/cache.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('react-query');
      expect(slots[0].cacheKey).toContain('vendor-patterns');
      expect(slots[0].producers).toHaveLength(1);
    });

    it('detects setQueryData with object literal data', () => {
      const code = `
        queryClient.setQueryData(['stats'], { total: 42, updated: true });
      `;
      const slots = detectQueryClientSlots(code, 'utils/cache.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].producers[0].keys).toEqual(expect.arrayContaining(['total', 'updated']));
    });

    it('detects setQueriesData', () => {
      const code = `
        queryClient.setQueriesData({ queryKey: ['vendors'] }, (old) => [...old, newVendor]);
      `;
      const slots = detectQueryClientSlots(code, 'utils/cache.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toContain('vendors');
    });

    it('returns empty for files without queryClient calls', () => {
      expect(detectQueryClientSlots('const x = 1;', 'utils.ts')).toEqual([]);
    });

    it('detects setQueryData with updater function as second arg', () => {
      const code = `
        queryClient.setQueryData(['key'], (old) => ({ ...old, count: old.count + 1 }));
      `;
      const slots = detectQueryClientSlots(code, 'utils/cache.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe("['key']");
    });

    it('detects multiple setQueryData calls in same file', () => {
      const code = `
        function updateCache(queryClient) {
          queryClient.setQueryData(['users'], newUsers);
          queryClient.setQueryData(['posts', id], newPost);
        }
      `;
      const slots = detectQueryClientSlots(code, 'utils/cache.ts');
      expect(slots).toHaveLength(2);
      const keys = slots.map(s => s.cacheKey);
      expect(keys).toContain("['users']");
      expect(keys).toContain("['posts', id]");
    });

    it('sets producer functionName from enclosing function', () => {
      const code = `
        function updateVendorCache(queryClient, newData) {
          queryClient.setQueryData(['vendors'], newData);
        }
      `;
      const slots = detectQueryClientSlots(code, 'utils/cache.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].producers[0].functionName).toBe('updateVendorCache');
    });
  });

  describe('detectCustomHookSlots', () => {
    it('detects a custom hook that wraps another hook and returns object literal', () => {
      const code = `
        function useFormattedVendors(slug) {
          const { data } = useVendorPatterns(slug);
          return { items: data?.patterns, count: data?.total };
        }
      `;
      const slots = detectCustomHookSlots(code, '/src/hooks/useFormattedVendors.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('custom-hook');
      expect(slots[0].cacheKey).toBe('useFormattedVendors');
      expect(slots[0].name).toBe('useFormattedVendors');
      expect(slots[0].producers).toHaveLength(1);
      expect(slots[0].producers[0].keys).toContain('items');
      expect(slots[0].producers[0].keys).toContain('count');
      expect(slots[0].producers[0].confidence).toBe('ast-literal');
    });

    it('detects multiple custom hooks in same file', () => {
      const code = `
        function useVendorItems(slug) {
          const { data } = useQuery({ queryKey: ['v', slug] });
          return { items: data?.list, total: data?.count };
        }

        function useGrantStatus(id) {
          const status = useGrantData(id);
          return { active: status.isActive, label: status.label };
        }
      `;
      const slots = detectCustomHookSlots(code, '/src/hooks/combined.ts');
      expect(slots).toHaveLength(2);
      const names = slots.map(s => s.name);
      expect(names).toContain('useVendorItems');
      expect(names).toContain('useGrantStatus');
    });

    it('ignores hooks that do not call other hooks', () => {
      const code = `
        function useLocalState() {
          const [val, setVal] = [0, () => {}];
          return { val, setVal };
        }
      `;
      const slots = detectCustomHookSlots(code, '/src/hooks/useLocalState.ts');
      expect(slots).toHaveLength(0);
    });

    it('ignores hooks that do not return an object literal', () => {
      const code = `
        function useRawData(slug) {
          const { data } = useVendorPatterns(slug);
          return data;
        }
      `;
      const slots = detectCustomHookSlots(code, '/src/hooks/useRawData.ts');
      expect(slots).toHaveLength(0);
    });

    it('returns empty for files without hooks', () => {
      const code = `
        function fetchData() {
          return fetch('/api').then(r => r.json());
        }
      `;
      const slots = detectCustomHookSlots(code, '/src/utils.ts');
      expect(slots).toHaveLength(0);
    });

    it('detects exported function hooks', () => {
      const code = `
        export function useFilteredItems(filter) {
          const { data } = useItems();
          return { filtered: data?.items.filter(filter), count: data?.total };
        }
      `;
      const slots = detectCustomHookSlots(code, '/src/hooks/useFilteredItems.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].producers[0].keys).toContain('filtered');
      expect(slots[0].producers[0].keys).toContain('count');
    });
  });

  describe('detectGraphQLSlots', () => {
    it('detects gql tagged template with query', () => {
      const code = `
        const GET_VENDORS = gql\`
          query GetVendors {
            vendors {
              id
              name
              patterns { total }
            }
          }
        \`;
      `;
      const slots = detectGraphQLSlots(code, '/src/queries/vendors.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('graphql');
      expect(slots[0].cacheKey).toBe('GetVendors');
      expect(slots[0].name).toBe('GetVendors');
      expect(slots[0].producers[0].keys).toContain('vendors');
      expect(slots[0].producers[0].confidence).toBe('ast-literal');
    });

    it('detects gql tagged template with mutation', () => {
      const code = `
        const UPDATE_VENDOR = gql\`
          mutation UpdateVendor($id: ID!, $input: VendorInput!) {
            updateVendor(id: $id, input: $input) {
              id
              name
            }
          }
        \`;
      `;
      const slots = detectGraphQLSlots(code, '/src/queries/vendors.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe('UpdateVendor');
      expect(slots[0].producers[0].keys).toContain('updateVendor');
    });

    it('detects multiple operations in same file', () => {
      const code = `
        const GET_USERS = gql\`
          query GetUsers {
            users { id name }
          }
        \`;

        const GET_POSTS = gql\`
          query GetPosts {
            posts { id title }
          }
        \`;
      `;
      const slots = detectGraphQLSlots(code, '/src/queries/index.ts');
      expect(slots).toHaveLength(2);
      const names = slots.map(s => s.cacheKey);
      expect(names).toContain('GetUsers');
      expect(names).toContain('GetPosts');
    });

    it('detects operations in .graphql files', () => {
      const code = `
        query GetVendors {
          vendors { id name }
        }

        mutation CreateVendor($input: VendorInput!) {
          createVendor(input: $input) {
            id
          }
        }
      `;
      const slots = detectGraphQLSlots(code, '/src/queries/vendors.graphql');
      expect(slots).toHaveLength(2);
      expect(slots[0].cacheKey).toBe('GetVendors');
      expect(slots[1].cacheKey).toBe('CreateVendor');
    });

    it('detects operations in .gql files', () => {
      const code = `
        query ListItems {
          items { id label }
        }
      `;
      const slots = detectGraphQLSlots(code, '/src/queries/items.gql');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe('ListItems');
    });

    it('returns empty for files without GraphQL', () => {
      const code = `
        export function fetchVendors() {
          return fetch('/api/vendors').then(r => r.json());
        }
      `;
      const slots = detectGraphQLSlots(code, '/src/utils.ts');
      expect(slots).toHaveLength(0);
    });

    it('sets producer functionName to variable name for gql tag', () => {
      const code = `
        const VENDOR_QUERY = gql\`
          query VendorQuery {
            vendor { id }
          }
        \`;
      `;
      const slots = detectGraphQLSlots(code, '/src/queries/vendor.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].producers[0].functionName).toBe('VENDOR_QUERY');
    });
  });

  describe('detectTRPCSlots', () => {
    it('detects server-side router procedure definitions', () => {
      const code = `
        export const appRouter = router({
          getVendors: publicProcedure.query(async () => {
            return db.vendor.findMany();
          }),
          updateVendor: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
            return db.vendor.update({ where: { id: input.id } });
          }),
        });
      `;
      const slots = detectTRPCSlots(code, '/src/server/router.ts');
      expect(slots).toHaveLength(2);
      const keys = slots.map(s => s.cacheKey);
      expect(keys).toContain('getVendors');
      expect(keys).toContain('updateVendor');
      expect(slots[0].slotKind).toBe('trpc');
      expect(slots[0].producers).toHaveLength(1);
    });

    it('detects client-side trpc hook usage', () => {
      const code = `
        function VendorList() {
          const { data } = trpc.getVendors.useQuery();
          const mutation = trpc.updateVendor.useMutation();
          return <div>{data?.length}</div>;
        }
      `;
      const slots = detectTRPCSlots(code, '/src/components/VendorList.tsx');
      expect(slots).toHaveLength(2);
      const keys = slots.map(s => s.cacheKey);
      expect(keys).toContain('getVendors');
      expect(keys).toContain('updateVendor');
      expect(slots.every(s => s.consumers.length > 0 || s.producers.length > 0)).toBe(true);
    });

    it('detects client-side with api alias', () => {
      const code = `
        function UserProfile() {
          const { data } = api.getUser.useQuery();
          return <div>{data?.name}</div>;
        }
      `;
      const slots = detectTRPCSlots(code, '/src/components/UserProfile.tsx');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe('getUser');
      expect(slots[0].consumers).toHaveLength(1);
    });

    it('detects useInfiniteQuery and useSuspenseQuery on tRPC client', () => {
      const code = `
        function ItemList() {
          const { data } = trpc.listItems.useInfiniteQuery();
          const { data: detail } = trpc.getItem.useSuspenseQuery();
          return null;
        }
      `;
      const slots = detectTRPCSlots(code, '/src/components/ItemList.tsx');
      expect(slots).toHaveLength(2);
      const keys = slots.map(s => s.cacheKey);
      expect(keys).toContain('listItems');
      expect(keys).toContain('getItem');
    });

    it('returns empty for files without tRPC', () => {
      const code = `
        function MyComponent() {
          const [state, setState] = useState(null);
          return <div>{state}</div>;
        }
      `;
      const slots = detectTRPCSlots(code, '/src/components/MyComponent.tsx');
      expect(slots).toHaveLength(0);
    });

    it('detects multiple procedures in a single router', () => {
      const code = `
        export const itemRouter = router({
          list: publicProcedure.query(async () => []),
          get: publicProcedure.input(z.string()).query(async () => null),
          create: publicProcedure.input(z.object({})).mutation(async () => null),
        });
      `;
      const slots = detectTRPCSlots(code, '/src/server/items.ts');
      expect(slots).toHaveLength(3);
      const keys = slots.map(s => s.cacheKey);
      expect(keys).toContain('list');
      expect(keys).toContain('get');
      expect(keys).toContain('create');
    });

    it('does not match non-tRPC property.hook patterns', () => {
      const code = `
        const x = React.useState.useQuery();
        console.log.useQuery();
      `;
      const slots = detectTRPCSlots(code, '/src/test.ts');
      // React is in the skip list, console is in the skip list
      expect(slots).toHaveLength(0);
    });
  });

  describe('detectReactContextSlots', () => {
    it('detects createContext with object default value', () => {
      const code = `
        const VendorContext = createContext({ vendors: [], loading: false });
      `;
      const slots = detectReactContextSlots(code, '/src/context/VendorContext.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('react-context');
      expect(slots[0].cacheKey).toBe('VendorContext');
      expect(slots[0].name).toBe('VendorContext');
      expect(slots[0].producers).toHaveLength(1);
      expect(slots[0].producers[0].keys).toContain('vendors');
      expect(slots[0].producers[0].keys).toContain('loading');
    });

    it('detects React.createContext', () => {
      const code = `
        const ThemeContext = React.createContext({ theme: 'light', toggle: null });
      `;
      const slots = detectReactContextSlots(code, '/src/context/ThemeContext.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe('ThemeContext');
      expect(slots[0].producers[0].keys).toContain('theme');
      expect(slots[0].producers[0].keys).toContain('toggle');
    });

    it('detects useContext as consumer', () => {
      const code = `
        function VendorList() {
          const { vendors, loading } = useContext(VendorContext);
          return <div>{loading ? 'Loading' : vendors.length}</div>;
        }
      `;
      const slots = detectReactContextSlots(code, '/src/components/VendorList.tsx');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe('VendorContext');
      expect(slots[0].consumers).toHaveLength(1);
      expect(slots[0].consumers[0].accessedKeys).toContain('vendors');
      expect(slots[0].consumers[0].accessedKeys).toContain('loading');
    });

    it('merges useContext consumer into createContext slot in same file', () => {
      const code = `
        const AppContext = createContext({ user: null, theme: 'dark' });

        function Header() {
          const { user, theme } = useContext(AppContext);
          return <div>{user?.name}</div>;
        }
      `;
      const slots = detectReactContextSlots(code, '/src/context/AppContext.tsx');
      expect(slots).toHaveLength(1);
      expect(slots[0].producers).toHaveLength(1);
      expect(slots[0].consumers).toHaveLength(1);
      expect(slots[0].consumers[0].accessedKeys).toContain('user');
      expect(slots[0].consumers[0].accessedKeys).toContain('theme');
    });

    it('detects createContext with null default', () => {
      const code = `
        const AuthContext = createContext(null);
      `;
      const slots = detectReactContextSlots(code, '/src/context/AuthContext.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].producers[0].keys).toHaveLength(0);
    });

    it('returns empty for files without context', () => {
      const code = `
        function MyComponent() {
          const [state, setState] = useState(null);
          return <div>{state}</div>;
        }
      `;
      const slots = detectReactContextSlots(code, '/src/components/MyComponent.tsx');
      expect(slots).toHaveLength(0);
    });
  });

  describe('detectReduxSlots', () => {
    it('detects createSlice with initialState', () => {
      const code = `
        const authSlice = createSlice({
          name: 'auth',
          initialState: { user: null, token: '', loading: false },
          reducers: {
            setUser: (state, action) => { state.user = action.payload; },
          },
        });
      `;
      const slots = detectReduxSlots(code, '/src/store/authSlice.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('redux');
      expect(slots[0].cacheKey).toBe('auth');
      expect(slots[0].name).toBe('auth');
      expect(slots[0].producers[0].keys).toContain('user');
      expect(slots[0].producers[0].keys).toContain('token');
      expect(slots[0].producers[0].keys).toContain('loading');
    });

    it('detects useSelector with state.slice.key', () => {
      const code = `
        function UserProfile() {
          const user = useSelector((state) => state.auth.user);
          const token = useSelector((state) => state.auth.token);
          return <div>{user?.name}</div>;
        }
      `;
      const slots = detectReduxSlots(code, '/src/components/UserProfile.tsx');
      expect(slots).toHaveLength(1);
      expect(slots[0].cacheKey).toBe('auth');
      // Both useSelector calls target 'auth', so consumers should be merged
      expect(slots[0].consumers.length).toBeGreaterThanOrEqual(1);
      const allKeys = slots[0].consumers.flatMap(c => c.accessedKeys);
      expect(allKeys).toContain('user');
      expect(allKeys).toContain('token');
    });

    it('returns empty for files without Redux', () => {
      const code = `
        function MyComponent() {
          const [state, setState] = useState(null);
          return <div>{state}</div>;
        }
      `;
      const slots = detectReduxSlots(code, '/src/components/MyComponent.tsx');
      expect(slots).toHaveLength(0);
    });

    it('detects multiple slices in same file', () => {
      const code = `
        const userSlice = createSlice({
          name: 'user',
          initialState: { name: '', email: '' },
          reducers: {},
        });

        const settingsSlice = createSlice({
          name: 'settings',
          initialState: { theme: 'light', lang: 'en' },
          reducers: {},
        });
      `;
      const slots = detectReduxSlots(code, '/src/store/slices.ts');
      expect(slots).toHaveLength(2);
      const names = slots.map(s => s.cacheKey);
      expect(names).toContain('user');
      expect(names).toContain('settings');
    });
  });

  describe('detectZustandSlots', () => {
    it('detects create() with factory returning object', () => {
      const code = `
        const useCountStore = create((set, get) => ({
          count: 0,
          increment: () => set((state) => ({ count: state.count + 1 })),
          reset: () => set({ count: 0 }),
        }));
      `;
      const slots = detectZustandSlots(code, '/src/store/countStore.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].slotKind).toBe('zustand');
      expect(slots[0].cacheKey).toBe('useCountStore');
      expect(slots[0].name).toBe('useCountStore');
      expect(slots[0].producers[0].keys).toContain('count');
      expect(slots[0].producers[0].keys).toContain('increment');
      expect(slots[0].producers[0].keys).toContain('reset');
    });

    it('detects useStore selector call', () => {
      const code = `
        function Counter() {
          const count = useCountStore((state) => state.count);
          const increment = useCountStore((state) => state.increment);
          return <button onClick={increment}>{count}</button>;
        }
      `;
      const slots = detectZustandSlots(code, '/src/components/Counter.tsx');
      expect(slots.length).toBeGreaterThanOrEqual(1);
      const countStore = slots.find(s => s.cacheKey === 'useCountStore');
      expect(countStore).toBeDefined();
      const allKeys = countStore!.consumers.flatMap(c => c.accessedKeys);
      expect(allKeys).toContain('count');
      expect(allKeys).toContain('increment');
    });

    it('returns empty for files without Zustand', () => {
      const code = `
        function MyComponent() {
          const [state, setState] = useState(null);
          return <div>{state}</div>;
        }
      `;
      const slots = detectZustandSlots(code, '/src/components/MyComponent.tsx');
      expect(slots).toHaveLength(0);
    });

    it('detects store with single-arg factory', () => {
      const code = `
        const useAuthStore = create((set) => ({
          user: null,
          login: (user) => set({ user }),
          logout: () => set({ user: null }),
        }));
      `;
      const slots = detectZustandSlots(code, '/src/store/authStore.ts');
      expect(slots).toHaveLength(1);
      expect(slots[0].producers[0].keys).toContain('user');
      expect(slots[0].producers[0].keys).toContain('login');
      expect(slots[0].producers[0].keys).toContain('logout');
    });
  });
});
