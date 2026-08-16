import { ReturnStatus } from '@prisma/client';
import { RETURN_STATUS_TRANSITIONS } from './returns.service';
import { MERCHANT_FAULT_REASONS, RETURN_REASONS } from './dto/return.dto';

describe('return lifecycle', () => {
  it('covers every status', () => {
    for (const status of Object.values(ReturnStatus)) {
      expect(RETURN_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('never allows a settled return to be reopened', () => {
    // Reopening a refunded return would let the same goods be paid for twice.
    expect(RETURN_STATUS_TRANSITIONS.REFUNDED).toEqual([]);
    expect(RETURN_STATUS_TRANSITIONS.REJECTED).toEqual([]);
    expect(RETURN_STATUS_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('only refunds after inspection', () => {
    // Restocking and refunding both hang off inspection, so no other status
    // may lead straight to REFUNDED.
    const canRefund = Object.entries(RETURN_STATUS_TRANSITIONS)
      .filter(([, next]) => next.includes(ReturnStatus.REFUNDED))
      .map(([from]) => from);
    expect(canRefund).toEqual([ReturnStatus.INSPECTED]);
  });

  it('only inspects what has actually arrived', () => {
    const canInspect = Object.entries(RETURN_STATUS_TRANSITIONS)
      .filter(([, next]) => next.includes(ReturnStatus.INSPECTED))
      .map(([from]) => from);
    expect(canInspect).toEqual([ReturnStatus.RECEIVED]);
  });

  it('lets a customer withdraw only before the goods are back with us', () => {
    const withdrawable = Object.entries(RETURN_STATUS_TRANSITIONS)
      .filter(([, next]) => next.includes(ReturnStatus.CANCELLED))
      .map(([from]) => from);
    expect(withdrawable).not.toContain(ReturnStatus.RECEIVED);
    expect(withdrawable).not.toContain(ReturnStatus.INSPECTED);
    expect(withdrawable).toContain(ReturnStatus.REQUESTED);
  });

  it('has no unreachable status', () => {
    const reachable = new Set<string>([ReturnStatus.REQUESTED]);
    // Walk the graph until it stops growing.
    let grew = true;
    while (grew) {
      grew = false;
      for (const from of [...reachable]) {
        for (const to of RETURN_STATUS_TRANSITIONS[from as ReturnStatus] ?? []) {
          if (!reachable.has(to)) {
            reachable.add(to);
            grew = true;
          }
        }
      }
    }
    expect([...Object.values(ReturnStatus)].filter((s) => !reachable.has(s))).toEqual([]);
  });
});

describe('return reasons', () => {
  it('treats faults as ours where they are ours', () => {
    // These decide who pays the return shipping, so a reason that drifts out
    // of the list quietly starts charging customers for our mistakes.
    expect(MERCHANT_FAULT_REASONS).toContain('DAMAGED_OR_DEFECTIVE');
    expect(MERCHANT_FAULT_REASONS).toContain('WRONG_ITEM_SENT');
    expect(MERCHANT_FAULT_REASONS).not.toContain('CHANGED_MIND');
    expect(MERCHANT_FAULT_REASONS).not.toContain('DOES_NOT_FIT');
  });

  it('keeps every fault reason within the published list', () => {
    for (const reason of MERCHANT_FAULT_REASONS) {
      expect(RETURN_REASONS).toContain(reason);
    }
  });
});
