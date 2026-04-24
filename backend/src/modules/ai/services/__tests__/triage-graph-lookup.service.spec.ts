// Phase 150 Wave 0 RED spec — TriageGraphLookupService.lookup
// Ref: .planning/phases/150-graph-triage-memory/150-VALIDATION.md §Wave 0 Requirements.
// Covers D-03 three-layer matrix, D-05 sender-beats-domain precedence,
// D-07 shadow counter always-on, D-04a normalization, validUntil expiry.
//
// This spec is expected to RED at Jest runtime until Plan 04 creates
// `../triage-graph-lookup.service`. tsc is unaffected because
// backend/tsconfig.json excludes `**/*spec.ts` from the compile graph.

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getToken } from '@willsoto/nestjs-prometheus';
import { TriageGraphLookupService } from '../triage-graph-lookup.service';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('TriageGraphLookupService.lookup', () => {
  let service: TriageGraphLookupService;
  const prismaMock = { $queryRaw: jest.fn() };
  const configMock = {
    get: jest.fn((_key: string, defaultValue?: string) => defaultValue ?? '9999'),
  };
  const lookupCounter = { inc: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Plan 04 hygiene fix (Rule 1): jest.clearAllMocks() does NOT reset
    // mockImplementation, so the cutoff=0.9 set in test 3 was leaking into
    // test 7 (which expects the default cutoff=9999 behavior). Reset the
    // configMock.get impl back to the suite default before each test.
    configMock.get.mockImplementation(
      (_key: string, defaultValue?: string) => defaultValue ?? '9999',
    );
    const mod = await Test.createTestingModule({
      providers: [
        TriageGraphLookupService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: getToken('triage_graph_lookup_total'), useValue: lookupCounter },
      ],
    }).compile();
    service = mod.get(TriageGraphLookupService);
  });

  it('returns null when no edge exists — outcome=missed', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    const result = await service.lookup('t1', 'boss@acme.com');
    expect(result).toBeNull();
    expect(lookupCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'missed', edge_source: 'none', tenant_id: 't1' }),
    );
  });

  it('returns null when confidence < 0.7 — outcome=missed', async () => {
    // Simulate the DB returning nothing because the WHERE confidence >= 0.7 filter excluded it
    prismaMock.$queryRaw.mockResolvedValue([]);
    const result = await service.lookup('t1', 'boss@acme.com');
    expect(result).toBeNull();
  });

  it('returns sender edge with source=sender — outcome=skipped when cutoff=0.9 and conf=0.95', async () => {
    configMock.get.mockImplementation((k: string, d?: string) =>
      k === 'TRIAGE_GRAPH_CONFIDENCE_CUTOFF' ? '0.9' : (d ?? '9999'),
    );
    // Rebuild module so constructor re-reads cutoff
    const mod = await Test.createTestingModule({
      providers: [
        TriageGraphLookupService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: getToken('triage_graph_lookup_total'), useValue: lookupCounter },
      ],
    }).compile();
    const svc = mod.get(TriageGraphLookupService);
    prismaMock.$queryRaw.mockResolvedValue([
      { confidence: 0.95, labelId: 'L1', labelName: 'Work', sourceType: 'sender' },
    ]);
    const result = await svc.lookup('t1', 'boss@acme.com');
    expect(result).toEqual({
      predictedLabelId: 'L1',
      predictedLabelName: 'Work',
      confidence: 0.95,
      source: 'sender',
    });
    expect(lookupCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'skipped', edge_source: 'sender', tenant_id: 't1' }),
    );
    // D-07 shadow counter also emits because >= 0.9
    expect(lookupCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'would_skip_shadow', edge_source: 'sender', tenant_id: 't1' }),
    );
  });

  it('returns sender edge hinted when 0.7 <= conf < cutoff', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { confidence: 0.8, labelId: 'L1', labelName: 'Work', sourceType: 'sender' },
    ]);
    const result = await service.lookup('t1', 'boss@acme.com');
    expect(result?.confidence).toBe(0.8);
    expect(lookupCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'hinted', edge_source: 'sender' }),
    );
  });

  it('returns domain edge when no sender edge exists', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { confidence: 0.85, labelId: 'L2', labelName: 'Marketing', sourceType: 'email_domain' },
    ]);
    const result = await service.lookup('t1', 'newsletter@acme.com');
    expect(result?.source).toBe('domain');
    expect(lookupCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ edge_source: 'domain' }),
    );
  });

  it('prefers sender over domain (D-05) via ORDER BY CASE WHEN', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { confidence: 0.75, labelId: 'L1', labelName: 'Work', sourceType: 'sender' },
    ]);
    await service.lookup('t1', 'boss@acme.com');
    const callArgs = prismaMock.$queryRaw.mock.calls[0];
    const sqlText = callArgs[0].strings ? callArgs[0].strings.join('?') : String(callArgs[0]);
    expect(sqlText).toMatch(/CASE WHEN src\."nodeType" = 'sender' THEN 0 ELSE 1 END/);
  });

  it('emits outcome=would_skip_shadow independently of cutoff when conf >= 0.9', async () => {
    // cutoff defaults to 9999 — shadow must still emit
    prismaMock.$queryRaw.mockResolvedValue([
      { confidence: 0.95, labelId: 'L1', labelName: 'Work', sourceType: 'sender' },
    ]);
    await service.lookup('t1', 'boss@acme.com');
    expect(lookupCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'would_skip_shadow' }),
    );
    // NOT skipped because cutoff=9999
    expect(lookupCounter.inc).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'skipped' }),
    );
  });

  it('excludes edges with validUntil <= now()', async () => {
    // Service cannot filter client-side; it relies on the SQL WHERE
    // (validUntil IS NULL OR validUntil > now()). Assert the SQL contains that predicate.
    prismaMock.$queryRaw.mockResolvedValue([]);
    await service.lookup('t1', 'boss@acme.com');
    const callArgs = prismaMock.$queryRaw.mock.calls[0];
    const sqlText = callArgs[0].strings ? callArgs[0].strings.join('?') : String(callArgs[0]);
    expect(sqlText).toMatch(/validUntil.*IS NULL OR.*validUntil.*>.*now\(\)/s);
  });

  it('normalizes senderEmail via trim().toLowerCase() — D-04a', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await service.lookup('t1', '  BOSS@ACME.com  ');
    const callArgs = prismaMock.$queryRaw.mock.calls[0];
    // The tagged-template substitution for ${normalized} should be "boss@acme.com"
    const values = callArgs.slice(1);
    expect(values).toContain('boss@acme.com');
  });

  it('extracts domain without + stripping or subdomain collapsing — D-04a', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await service.lookup('t1', 'user+work@mail.acme.com');
    const callArgs = prismaMock.$queryRaw.mock.calls[0];
    const values = callArgs.slice(1);
    // Domain is "mail.acme.com" — NOT "acme.com"
    expect(values).toContain('mail.acme.com');
    // Sender kept with + intact
    expect(values).toContain('user+work@mail.acme.com');
  });
});
