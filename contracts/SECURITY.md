# Vault security notes

**Status: test software. Not audited. Do not hold real money in it.**

## Static analysis

Slither was **not installed** on the build machine, so it was not run. Run before any audit:

```sh
pip install slither-analyzer
slither contracts/src --solc-remaps "@openzeppelin/contracts/=contracts/node_modules/@openzeppelin/contracts/"
```

`forge lint` (built into `forge build`) reports only style notes (immutable naming).

## What is defended, and how

| Risk | Defence | Test |
|---|---|---|
| A settle batch retried after a crash pays twice | Batch key marked used before transfers; reuse reverts `KeyAlreadyUsed`; client checks `usedKey` first | `test_settle_revertsOnReusedBatchKey`, `settle.test.ts` |
| One bad item in a batch | Whole transaction reverts; nothing moves, key stays unused | `test_settle_revertsWholeBatch_whenOneItemOverdraws` |
| Batch key reused as a withdrawal key | One shared used-key set | `test_usedKeys_sharedBetweenBatchAndWithdrawal` |
| Token returns false | `SafeERC20` everywhere | — |
| Fee-on-transfer token inflates ledger | `deposit` credits the measured balance change | invariant |
| Ledger drifts from token balance | Invariant fuzzed over deposit, settle, withdraw, collectFees, exit | `invariant_tokenBalanceEqualsLedger` |
| Operator freezes a business's funds | 7-day exit that `pause` never blocks | `test_executeExit_worksWhilePaused` |
| Reentrancy via token hooks | `nonReentrant` on every state change that transfers | — |
| Reorg removes a seen deposit | Client only reports deposits at or below `getConfirmedBlock` | `settle.test.ts` |

## What an auditor must check before real money

1. **Role separation.** Today one server key holds admin, registrar and operator. In
   production: admin behind a multisig and timelock; operator and registrar on separate
   hot keys with no admin power; consider a per-batch cap on the operator.
2. **The single-server-key arrangement is test-only.** A leaked operator key can settle
   any business's balance to any registered seller, and a leaked registrar key can
   re-point a seller's payout address. Re-registration replacing addresses is a
   convenience for retries; production should time-lock address changes.
3. **The exit path.** `executeExit` pays the whole on-chain balance. If the ledger still
   owes sellers for unsettled charges, those sellers are not paid from the vault. Core must
   settle that business as soon as `ExitRequested` is seen (the operator can settle during
   the delay; tested). An auditor should decide whether exit should reserve an owed amount.
4. **Token assumptions.** Built for USDC: 6 decimals, no rebasing, no transfer fee. USDC
   can blacklist addresses; a blacklisted seller payout address would make a whole batch
   revert. Core should split batches or skip that seller.
5. **Derived test addresses.** Addresses derived from the public anvil mnemonic are known
   to everyone. Never use `testAddressMnemonic` outside test.
6. **Unregistered business with a pending exit.** `requestExit` requires the caller to be
   the registered withdraw address; re-registering a business during an exit changes
   where the exit pays. Production should forbid re-registration while an exit is pending.
