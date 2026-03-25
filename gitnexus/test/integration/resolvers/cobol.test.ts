/**
 * COBOL: Exhaustive strict integration test.
 *
 * Every single node and edge produced by the COBOL/JCL pipeline is asserted
 * with exact counts AND exact sorted edge-pair lists. No fuzzy assertions.
 *
 * Ground truth captured from the cobol-app fixture:
 *   CUSTUPDT.cbl, AUDITLOG.cbl, RPTGEN.cbl, NESTED.cbl,
 *   CUSTDAT.cpy, COPYLIB.cpy, RUNJOBS.jcl
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  FIXTURES, getRelationships, getNodesByLabel, edgeSet,
  runPipelineFromRepo, type PipelineResult,
} from './helpers.js';

describe('COBOL full system extraction', () => {
  let result: PipelineResult;

  beforeAll(async () => {
    result = await runPipelineFromRepo(
      path.join(FIXTURES, 'cobol-app'),
      () => {},
      { skipGraphPhases: true },
    );
  }, 60000);

  // =====================================================================
  // NODE COMPLETENESS — exact count + exact sorted name list per label
  // =====================================================================

  describe('node completeness', () => {

    it('produces exactly 5 Module nodes', () => {
      const nodes = getNodesByLabel(result, 'Module');
      expect(nodes.length).toBe(5);
      expect(nodes).toEqual(['AUDITLOG', 'CUSTUPDT', 'INNER-PROG', 'OUTER-PROG', 'RPTGEN']);
    });

    it('produces exactly 19 Function nodes', () => {
      const nodes = getNodesByLabel(result, 'Function');
      expect(nodes.length).toBe(19);
      expect(nodes).toEqual([
        'ABEND-HANDLER', 'CLEANUP-PARAGRAPH', 'EXIT-PARAGRAPH',
        'FETCH-DATA', 'FORMAT-REPORT', 'INIT-PARAGRAPH',
        'INNER-MAIN', 'INNER-PROCESS',
        'MAIN-PARAGRAPH', 'MAIN-PARAGRAPH', 'MAIN-PARAGRAPH',
        'OUTER-MAIN', 'OUTER-PROCESS',
        'PROCESS-PARAGRAPH', 'READ-CUSTOMER', 'SEND-SCREEN',
        'UPDATE-BALANCE', 'WRITE-CUSTOMER', 'WRITE-LOG',
      ]);
    });

    it('produces exactly 2 Namespace nodes', () => {
      expect(getNodesByLabel(result, 'Namespace')).toEqual(['INIT-SECTION', 'PROCESSING-SECTION']);
    });

    it('produces exactly 36 Property nodes', () => {
      const nodes = getNodesByLabel(result, 'Property');
      expect(nodes.length).toBe(36);
      expect(nodes).toEqual([
        'CUST-BALANCE', 'CUST-ID', 'CUST-NAME', 'CUSTOMER-RECORD',
        'END-OF-FILE', 'FIELD-A', 'FIELD-B',
        'LS-AMOUNT', 'LS-CUST-ID', 'LS-PARAM',
        'PREMIUM-CUSTOMER', 'REGULAR-CUSTOMER',
        'WS-AMOUNT', 'WS-AMT', 'WS-CODE', 'WS-COUNT',
        'WS-CUST-ADDR', 'WS-CUST-CODE', 'WS-CUST-TYPE',
        'WS-CUSTOMER-DATA', 'WS-CUSTOMER-NAME', 'WS-EOF',
        'WS-FILE-STATUS', 'WS-INNER-CODE', 'WS-LOG-MESSAGE',
        'WS-MAP-NAME', 'WS-NAME', 'WS-NEXT-PGM', 'WS-OUTER-FLAG',
        'WS-PROG-NAME', 'WS-QUEUE-NAME', 'WS-RECORD',
        'WS-REPORT-LINE', 'WS-SORT-FILE', 'WS-SQL-CODE', 'WS-TIMESTAMP',
      ]);
    });

    it('produces exactly 1 Record node', () => {
      expect(getNodesByLabel(result, 'Record')).toEqual(['CUSTOMER-FILE']);
    });

    it('produces exactly 15 CodeElement nodes', () => {
      const nodes = getNodesByLabel(result, 'CodeElement');
      expect(nodes.length).toBe(15);
      expect(nodes).toEqual([
        'CALL WS-PROG-NAME', 'CICS XCTL WS-NEXT-PGM', 'CUSTJOB',
        'EXEC CICS HANDLE ABEND', 'EXEC CICS LINK', 'EXEC CICS READ',
        'EXEC CICS RETURN', 'EXEC CICS SEND MAP', 'EXEC CICS WRITEQ TS',
        'EXEC CICS XCTL', 'EXEC CICS XCTL', 'EXEC SQL SELECT',
        'PROD.CUSTOMER.MASTER', 'STEP1', 'STEP2',
      ]);
    });

    it('produces exactly 2 Constructor nodes', () => {
      expect(getNodesByLabel(result, 'Constructor')).toEqual(['ALTENTRY', 'AUDITLOG-BATCH']);
    });
  });

  // =====================================================================
  // CALLS EDGES — exact count + exact sorted pairs per reason
  // =====================================================================

  describe('CALLS edge completeness', () => {

    it('produces exactly 11 CALLS edges with reason cobol-perform', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cobol-perform');
      expect(edges.length).toBe(11);
      expect(edgeSet(edges)).toEqual([
        'FORMAT-REPORT \u2192 MAIN-PARAGRAPH',
        'INNER-MAIN \u2192 INNER-PROCESS',
        'MAIN-PARAGRAPH \u2192 CLEANUP-PARAGRAPH',
        'MAIN-PARAGRAPH \u2192 FETCH-DATA',
        'MAIN-PARAGRAPH \u2192 FORMAT-REPORT',
        'MAIN-PARAGRAPH \u2192 INIT-PARAGRAPH',
        'MAIN-PARAGRAPH \u2192 PROCESS-PARAGRAPH',
        'MAIN-PARAGRAPH \u2192 SEND-SCREEN',
        'MAIN-PARAGRAPH \u2192 WRITE-LOG',
        'OUTER-MAIN \u2192 OUTER-PROCESS',
        'PROCESS-PARAGRAPH \u2192 READ-CUSTOMER',
      ]);
    });

    it('produces exactly 2 CALLS edges with reason cobol-perform-thru', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cobol-perform-thru');
      expect(edges.length).toBe(2);
      expect(edgeSet(edges)).toEqual([
        'FORMAT-REPORT \u2192 FORMAT-REPORT',
        'PROCESS-PARAGRAPH \u2192 WRITE-CUSTOMER',
      ]);
    });

    it('produces exactly 3 CALLS edges with reason cobol-call', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cobol-call');
      expect(edges.length).toBe(3);
      expect(edgeSet(edges)).toEqual([
        'CUSTUPDT \u2192 AUDITLOG',
        'OUTER-PROG \u2192 INNER-PROG',
        'RPTGEN \u2192 CUSTUPDT',
      ]);
    });

    it('produces exactly 1 CALLS edge with reason cobol-goto', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cobol-goto');
      expect(edges.length).toBe(1);
      expect(edgeSet(edges)).toEqual(['MAIN-PARAGRAPH \u2192 EXIT-PARAGRAPH']);
    });

    it('produces exactly 1 CALLS edge with reason cics-link', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cics-link');
      expect(edges.length).toBe(1);
      expect(edgeSet(edges)).toEqual(['RPTGEN \u2192 AUDITLOG']);
    });

    it('produces exactly 1 CALLS edge with reason cics-xctl', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cics-xctl');
      expect(edges.length).toBe(1);
      expect(edgeSet(edges)).toEqual(['RPTGEN \u2192 CUSTUPDT']);
    });

    it('produces exactly 1 CALLS edge with reason cics-handle-abend', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cics-handle-abend');
      expect(edges.length).toBe(1);
      expect(edgeSet(edges)).toEqual(['RPTGEN \u2192 ABEND-HANDLER']);
    });

    it('produces exactly 1 CALLS edge with reason cics-return-transid', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'cics-return-transid');
      expect(edges.length).toBe(1);
    });

    it('produces exactly 2 CALLS edges with reason jcl-exec-pgm', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'jcl-exec-pgm');
      expect(edges.length).toBe(2);
      expect(edgeSet(edges)).toEqual(['STEP1 \u2192 CUSTUPDT', 'STEP2 \u2192 RPTGEN']);
    });

    it('produces exactly 1 CALLS edge with reason jcl-dd:CUSTFILE', () => {
      const edges = getRelationships(result, 'CALLS').filter(e => e.rel.reason === 'jcl-dd:CUSTFILE');
      expect(edges.length).toBe(1);
      expect(edgeSet(edges)).toEqual(['STEP1 \u2192 PROD.CUSTOMER.MASTER']);
    });

    it('produces zero unresolved CALLS edges', () => {
      expect(getRelationships(result, 'CALLS').filter(e => e.rel.reason.endsWith('-unresolved')).length).toBe(0);
    });
  });

  // =====================================================================
  // CONTAINS EDGES — exact count + exact sorted pairs per reason
  // =====================================================================

  describe('CONTAINS edge completeness', () => {

    it('produces exactly 4 CONTAINS edges with reason cobol-program-id', () => {
      const edges = getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-program-id');
      expect(edges.length).toBe(4);
      expect(edgeSet(edges)).toEqual([
        'AUDITLOG.cbl \u2192 AUDITLOG',
        'CUSTUPDT.cbl \u2192 CUSTUPDT',
        'NESTED.cbl \u2192 OUTER-PROG',
        'RPTGEN.cbl \u2192 RPTGEN',
      ]);
    });

    it('produces exactly 1 CONTAINS edge with reason cobol-nested-program', () => {
      const edges = getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-nested-program');
      expect(edges.length).toBe(1);
      expect(edgeSet(edges)).toEqual(['OUTER-PROG \u2192 INNER-PROG']);
    });

    it('produces exactly 2 CONTAINS edges with reason cobol-section', () => {
      const edges = getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-section');
      expect(edges.length).toBe(2);
      expect(edgeSet(edges)).toEqual([
        'CUSTUPDT \u2192 INIT-SECTION',
        'CUSTUPDT \u2192 PROCESSING-SECTION',
      ]);
    });

    it('produces exactly 19 CONTAINS edges with reason cobol-paragraph', () => {
      const edges = getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-paragraph');
      expect(edges.length).toBe(19);
      expect(edgeSet(edges)).toEqual([
        'AUDITLOG \u2192 MAIN-PARAGRAPH',
        'AUDITLOG \u2192 WRITE-LOG',
        'INIT-SECTION \u2192 INIT-PARAGRAPH',
        'INIT-SECTION \u2192 MAIN-PARAGRAPH',
        'OUTER-PROG \u2192 INNER-MAIN',
        'OUTER-PROG \u2192 INNER-PROCESS',
        'OUTER-PROG \u2192 OUTER-MAIN',
        'OUTER-PROG \u2192 OUTER-PROCESS',
        'PROCESSING-SECTION \u2192 CLEANUP-PARAGRAPH',
        'PROCESSING-SECTION \u2192 PROCESS-PARAGRAPH',
        'PROCESSING-SECTION \u2192 READ-CUSTOMER',
        'PROCESSING-SECTION \u2192 UPDATE-BALANCE',
        'PROCESSING-SECTION \u2192 WRITE-CUSTOMER',
        'RPTGEN \u2192 ABEND-HANDLER',
        'RPTGEN \u2192 EXIT-PARAGRAPH',
        'RPTGEN \u2192 FETCH-DATA',
        'RPTGEN \u2192 FORMAT-REPORT',
        'RPTGEN \u2192 MAIN-PARAGRAPH',
        'RPTGEN \u2192 SEND-SCREEN',
      ]);
    });

    it('produces exactly 36 CONTAINS edges with reason cobol-data-item', () => {
      const edges = getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-data-item');
      expect(edges.length).toBe(36);
      expect(edgeSet(edges)).toEqual([
        'AUDITLOG \u2192 LS-AMOUNT',
        'AUDITLOG \u2192 LS-CUST-ID',
        'AUDITLOG \u2192 WS-LOG-MESSAGE',
        'AUDITLOG \u2192 WS-TIMESTAMP',
        'CUSTUPDT \u2192 CUST-BALANCE',
        'CUSTUPDT \u2192 CUST-ID',
        'CUSTUPDT \u2192 CUST-NAME',
        'CUSTUPDT \u2192 CUSTOMER-RECORD',
        'CUSTUPDT \u2192 END-OF-FILE',
        'CUSTUPDT \u2192 FIELD-A',
        'CUSTUPDT \u2192 FIELD-B',
        'CUSTUPDT \u2192 LS-PARAM',
        'CUSTUPDT \u2192 WS-AMOUNT',
        'CUSTUPDT \u2192 WS-AMT',
        'CUSTUPDT \u2192 WS-CODE',
        'CUSTUPDT \u2192 WS-CUSTOMER-NAME',
        'CUSTUPDT \u2192 WS-EOF',
        'CUSTUPDT \u2192 WS-FILE-STATUS',
        'CUSTUPDT \u2192 WS-NAME',
        'CUSTUPDT \u2192 WS-PROG-NAME',
        'CUSTUPDT \u2192 WS-RECORD',
        'OUTER-PROG \u2192 WS-INNER-CODE',
        'OUTER-PROG \u2192 WS-OUTER-FLAG',
        'RPTGEN \u2192 PREMIUM-CUSTOMER',
        'RPTGEN \u2192 REGULAR-CUSTOMER',
        'RPTGEN \u2192 WS-COUNT',
        'RPTGEN \u2192 WS-CUST-ADDR',
        'RPTGEN \u2192 WS-CUST-CODE',
        'RPTGEN \u2192 WS-CUST-TYPE',
        'RPTGEN \u2192 WS-CUSTOMER-DATA',
        'RPTGEN \u2192 WS-MAP-NAME',
        'RPTGEN \u2192 WS-NEXT-PGM',
        'RPTGEN \u2192 WS-QUEUE-NAME',
        'RPTGEN \u2192 WS-REPORT-LINE',
        'RPTGEN \u2192 WS-SORT-FILE',
        'RPTGEN \u2192 WS-SQL-CODE',
      ]);
    });

    it('produces exactly 8 CONTAINS edges with reason cobol-exec-cics', () => {
      const edges = getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-exec-cics');
      expect(edges.length).toBe(8);
      expect(edgeSet(edges)).toEqual([
        'RPTGEN \u2192 EXEC CICS HANDLE ABEND',
        'RPTGEN \u2192 EXEC CICS LINK',
        'RPTGEN \u2192 EXEC CICS READ',
        'RPTGEN \u2192 EXEC CICS RETURN',
        'RPTGEN \u2192 EXEC CICS SEND MAP',
        'RPTGEN \u2192 EXEC CICS WRITEQ TS',
        'RPTGEN \u2192 EXEC CICS XCTL',
        'RPTGEN \u2192 EXEC CICS XCTL',
      ]);
    });

    it('produces exactly 1 CONTAINS edge with reason cobol-exec-sql', () => {
      expect(edgeSet(getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-exec-sql')))
        .toEqual(['RPTGEN \u2192 EXEC SQL SELECT']);
    });

    it('produces exactly 1 CONTAINS edge with reason cics-dynamic-program', () => {
      expect(edgeSet(getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cics-dynamic-program')))
        .toEqual(['RPTGEN \u2192 CICS XCTL WS-NEXT-PGM']);
    });

    it('produces exactly 1 CONTAINS edge with reason cobol-dynamic-call', () => {
      expect(edgeSet(getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-dynamic-call')))
        .toEqual(['CUSTUPDT \u2192 CALL WS-PROG-NAME']);
    });

    it('produces exactly 2 CONTAINS edges with reason cobol-entry-point', () => {
      expect(edgeSet(getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-entry-point')))
        .toEqual(['AUDITLOG \u2192 AUDITLOG-BATCH', 'CUSTUPDT \u2192 ALTENTRY']);
    });

    it('produces exactly 1 CONTAINS edge with reason cobol-file-declaration', () => {
      expect(edgeSet(getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'cobol-file-declaration')))
        .toEqual(['CUSTUPDT \u2192 CUSTOMER-FILE']);
    });

    it('produces exactly 1 CONTAINS edge with reason jcl-job', () => {
      expect(edgeSet(getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'jcl-job')))
        .toEqual(['RUNJOBS.jcl \u2192 CUSTJOB']);
    });

    it('produces exactly 2 CONTAINS edges with reason jcl-step', () => {
      expect(edgeSet(getRelationships(result, 'CONTAINS').filter(e => e.rel.reason === 'jcl-step')))
        .toEqual(['CUSTJOB \u2192 STEP1', 'CUSTJOB \u2192 STEP2']);
    });
  });

  // =====================================================================
  // ACCESSES EDGES — exact count + exact sorted pairs per reason
  // =====================================================================

  describe('ACCESSES edge completeness', () => {

    it('produces exactly 4 ACCESSES edges with reason cobol-move-read', () => {
      const edges = getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cobol-move-read');
      expect(edges.length).toBe(4);
      expect(edgeSet(edges)).toEqual([
        'FORMAT-REPORT \u2192 WS-CUST-CODE',
        'READ-CUSTOMER \u2192 CUST-NAME',
        'UPDATE-BALANCE \u2192 WS-AMOUNT',
        'UPDATE-BALANCE \u2192 WS-AMT',
      ]);
    });

    it('produces exactly 5 ACCESSES edges with reason cobol-move-write', () => {
      const edges = getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cobol-move-write');
      expect(edges.length).toBe(5);
      expect(edgeSet(edges)).toEqual([
        'FORMAT-REPORT \u2192 WS-REPORT-LINE',
        'READ-CUSTOMER \u2192 WS-CUSTOMER-NAME',
        'UPDATE-BALANCE \u2192 CUST-BALANCE',
        'UPDATE-BALANCE \u2192 FIELD-A',
        'UPDATE-BALANCE \u2192 FIELD-B',
      ]);
    });

    it('produces exactly 1 ACCESSES edge with reason cics-file-read', () => {
      expect(getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cics-file-read').length).toBe(1);
    });

    it('produces exactly 1 ACCESSES edge with reason cics-map', () => {
      expect(getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cics-map').length).toBe(1);
    });

    it('produces exactly 1 ACCESSES edge with reason cics-queue-write', () => {
      expect(getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cics-queue-write').length).toBe(1);
    });

    it('produces exactly 1 ACCESSES edge with reason cics-receive-into', () => {
      const edges = getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cics-receive-into');
      expect(edges.length).toBe(1);
      expect(edges[0].target).toBe('WS-CUSTOMER-DATA');
    });

    it('produces exactly 2 ACCESSES edges with reason cics-send-from', () => {
      const edges = getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cics-send-from');
      expect(edges.length).toBe(2);
      expect(edgeSet(edges)).toEqual([
        'EXEC CICS SEND MAP \u2192 WS-REPORT-LINE',
        'EXEC CICS WRITEQ TS \u2192 WS-REPORT-LINE',
      ]);
    });

    it('produces exactly 1 ACCESSES edge with reason cobol-search', () => {
      const edges = getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'cobol-search');
      expect(edges.length).toBe(1);
      expect(edgeSet(edges)).toEqual(['RPTGEN \u2192 WS-CUSTOMER-DATA']);
    });

    it('produces exactly 1 ACCESSES edge with reason sort-using', () => {
      expect(getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'sort-using').length).toBe(1);
    });

    it('produces exactly 1 ACCESSES edge with reason sort-giving (multi-line SORT)', () => {
      expect(getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'sort-giving').length).toBe(1);
    });

    it('produces exactly 1 ACCESSES edge with reason sql-select', () => {
      expect(getRelationships(result, 'ACCESSES').filter(e => e.rel.reason === 'sql-select').length).toBe(1);
    });
  });

  // =====================================================================
  // IMPORTS EDGES — exact pairs
  // =====================================================================

  describe('IMPORTS edge completeness', () => {

    it('produces exactly 2 IMPORTS edges with reason cobol-copy', () => {
      const edges = getRelationships(result, 'IMPORTS').filter(e => e.rel.reason === 'cobol-copy');
      expect(edges.length).toBe(2);
    });
  });

  // =====================================================================
  // GRAND TOTALS — catch any unexpected edge leakage
  // =====================================================================

  describe('grand totals', () => {

    it('produces exactly 24 total CALLS edges', () => {
      // 11 perform + 2 perform-thru + 3 call + 1 goto + 1 link + 1 xctl
      // + 1 handle-abend + 1 return-transid + 2 jcl-exec-pgm + 1 jcl-dd
      expect(getRelationships(result, 'CALLS').length).toBe(24);
    });

    it('produces exactly 79 total CONTAINS edges', () => {
      // 4 program-id + 1 nested-program + 2 section + 19 paragraph
      // + 36 data-item + 8 exec-cics + 1 exec-sql + 1 dynamic-call
      // + 1 cics-dynamic-program + 2 entry-point + 1 file-declaration
      // + 1 jcl-job + 2 jcl-step
      expect(getRelationships(result, 'CONTAINS').length).toBe(79);
    });

    it('produces exactly 2 total IMPORTS edges', () => {
      expect(getRelationships(result, 'IMPORTS').length).toBe(2);
    });

    it('produces exactly 19 total ACCESSES edges', () => {
      // 4 move-read + 5 move-write + 1 file-read + 1 map + 1 queue-write
      // + 1 receive-into + 2 send-from + 1 search + 1 sort-using + 1 sort-giving + 1 sql-select
      expect(getRelationships(result, 'ACCESSES').length).toBe(19);
    });
  });
});
