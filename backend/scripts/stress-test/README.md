# Production Stress Test Suite

## Overview

Validates MailAgent can serve 1000+ concurrent users with:
- Real email data (Enron dataset - 500k emails)
- Concurrent sync operations
- API endpoint load testing
- Memory/CPU monitoring
- Data integrity verification

## Prerequisites

1. Download Enron dataset:
   ```bash
   # From Kaggle: https://www.kaggle.com/datasets/wcukierski/enron-email-dataset
   # Extract to: backend/scripts/stress-test/enron-data/
   ```

2. Install dependencies:
   ```bash
   npm install autocannon clinic
   ```

## Test Scenarios

| Scenario | Users | Operations | Duration |
|----------|-------|------------|----------|
| Smoke | 10 | 100 emails each | 1 min |
| Load | 100 | 1000 emails each | 5 min |
| Stress | 500 | 5000 emails each | 15 min |
| Spike | 1000 | Burst traffic | 30 min |

## Running Tests

```bash
# Setup test tenants
npx ts-node -r dotenv/config scripts/stress-test/setup-test-tenants.ts

# Run stress test
npx ts-node -r dotenv/config scripts/stress-test/run-stress-test.ts --scenario=stress

# Generate report
npx ts-node -r dotenv/config scripts/stress-test/generate-report.ts
```

## Success Criteria

- [ ] P99 response time < 500ms
- [ ] Zero data corruption
- [ ] No memory leaks (stable heap)
- [ ] All 1000 tenants synced correctly
- [ ] Redis locks prevent race conditions
- [ ] P2034 deadlocks recovered automatically
