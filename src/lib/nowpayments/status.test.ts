import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionPayment, mapNowPaymentsStatus } from "./status";

test("maps NOWPayments invoice statuses", () => {
  assert.equal(mapNowPaymentsStatus("waiting"), "processing");
  assert.equal(mapNowPaymentsStatus("confirming"), "processing");
  assert.equal(mapNowPaymentsStatus("confirmed"), "processing");
  assert.equal(mapNowPaymentsStatus("sending"), "processing");
  assert.equal(mapNowPaymentsStatus("finished"), "paid");
  assert.equal(mapNowPaymentsStatus("partially_paid"), "under_review");
  assert.equal(mapNowPaymentsStatus("failed"), "failed");
  assert.equal(mapNowPaymentsStatus("expired"), "expired");
  assert.equal(mapNowPaymentsStatus("refunded"), "under_review");
  assert.equal(mapNowPaymentsStatus("unknown"), null);
});

test("prevents payment status regressions and changes after terminal states", () => {
  assert.equal(canTransitionPayment("pending", "processing"), true);
  assert.equal(canTransitionPayment("processing", "pending"), false);
  assert.equal(canTransitionPayment("processing", "under_review"), true);
  assert.equal(canTransitionPayment("under_review", "paid"), true);
  assert.equal(canTransitionPayment("under_review", "processing"), false);
  assert.equal(canTransitionPayment("paid", "failed"), false);
  assert.equal(canTransitionPayment("failed", "paid"), false);
  assert.equal(canTransitionPayment("expired", "processing"), false);
});
