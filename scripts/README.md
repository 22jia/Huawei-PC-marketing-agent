# Scripts

Place repeatable developer tasks here, such as API smoke tests and demo-data setup. Scripts must read secrets from environment variables only.

- `demo-customer-assist.cjs`: runs the customer-conversion assistance flow against ima. It may return `partial` when ima temporarily limits source retrieval; that status must be shown to the user rather than treated as verified evidence.
