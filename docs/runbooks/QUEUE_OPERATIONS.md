# Queue Operations Runbook

This runbook provides operational guidance for managing PmSync's BullMQ queues.

## Quick Reference

| Queue Name | Purpose | Max Concurrency | Retry Policy |
|------------|---------|-----------------|--------------|
| `email-sync` | IMAP/Graph sync | 5 | 3 attempts, exp backoff |
| `embedding` | Vector embeddings | 3 | 3 attempts |
| `ai-analysis` | Email AI analysis | 5 | 2 attempts |
| `ai-queue` | General AI tasks | 5 | 3 attempts |
| `folder-operations` | Folder CRUD | 3 | 3 attempts |

## Health Endpoints

```bash
# All queues health status
curl http://localhost:3000/health/queues/all

# Single queue status
curl http://localhost:3000/health/queues/email-sync

# Prometheus metrics
curl http://localhost:3000/health/metrics
```

---

## Runbook: Failed Jobs

### Symptoms
- Alert: `QueueJobsFailedCritical` or `SingleQueueFailedHigh`
- Dashboard shows increasing failed job count
- Users report features not working

### Diagnosis

1. **Check failed job count by queue:**
   ```bash
   curl http://localhost:3000/health/queues/all | jq '.queues[] | {name, failed}'
   ```

2. **Check application logs for errors:**
   ```bash
   docker logs mailagent-backend --since 30m 2>&1 | grep -i "error\|failed"
   ```

3. **Check Redis connectivity:**
   ```bash
   docker exec mailagent-redis redis-cli ping
   ```

### Resolution

1. **View failed jobs in Bull Board (if enabled):**
   Navigate to `http://localhost:3000/admin/queues`

2. **Retry failed jobs via API:**
   ```bash
   # Retry all failed jobs in a queue (if endpoint available)
   curl -X POST http://localhost:3000/admin/queues/email-sync/retry-failed
   ```

3. **Manual retry via Redis:**
   ```bash
   docker exec -it mailagent-redis redis-cli
   # Move failed jobs back to wait list
   LRANGE bull:email-sync:failed 0 -1
   ```

4. **Clear failed jobs if unrecoverable:**
   ```bash
   docker exec mailagent-redis redis-cli DEL bull:email-sync:failed
   ```

### Prevention
- Monitor failed job trends in Grafana
- Set up DLQ processing for persistent failures
- Review job retry configuration

---

## Runbook: Single Queue Failures

### Symptoms
- One specific queue has high failure rate
- Other queues are healthy

### Diagnosis

1. **Identify the problematic queue:**
   ```bash
   curl http://localhost:3000/health/queues/all | jq '.queues | sort_by(.failed) | reverse | .[0:3]'
   ```

2. **Check for queue-specific errors:**
   ```bash
   docker logs mailagent-backend --since 1h 2>&1 | grep "<queue-name>"
   ```

3. **Check external dependencies:**
   - `email-sync` -> IMAP/Graph API connectivity
   - `embedding` -> Mistral API availability
   - `ai-*` -> AI service quotas

### Resolution

1. **Pause the queue temporarily:**
   ```bash
   curl -X POST http://localhost:3000/admin/queues/<queue-name>/pause
   ```

2. **Fix underlying issue** (network, API keys, quotas)

3. **Resume the queue:**
   ```bash
   curl -X POST http://localhost:3000/admin/queues/<queue-name>/resume
   ```

---

## Runbook: Backlog

### Symptoms
- Alert: `QueueBacklogCritical` or `QueueBacklogWarning`
- Jobs waiting > 500
- Slow feature response times

### Diagnosis

1. **Check waiting vs active ratio:**
   ```bash
   curl http://localhost:3000/health/queues/all | jq '.summary'
   ```

2. **Check worker count:**
   ```bash
   # In application logs
   docker logs mailagent-backend | grep -i "worker\|processor"
   ```

3. **Check system resources:**
   ```bash
   docker stats mailagent-backend
   ```

### Resolution

1. **Scale workers (if using separate worker processes):**
   ```bash
   docker-compose up --scale worker=3
   ```

2. **Increase concurrency (requires code change + restart):**
   - Edit `queue.config.ts` defaultJobOptions
   - Restart application

3. **Clear non-critical jobs (emergency only):**
   ```bash
   docker exec mailagent-redis redis-cli DEL bull:<queue-name>:wait
   ```

4. **Prioritize critical queues:**
   - Email-sync: highest priority
   - AI queues: can tolerate delays

### Prevention
- Set up auto-scaling based on queue depth
- Monitor backlog trends weekly
- Review job priorities quarterly

---

## Runbook: Stalled Workers

### Symptoms
- Jobs stuck in "active" state for extended periods
- `queue_jobs_active` high but no completions

### Diagnosis

1. **Check for stalled jobs:**
   ```bash
   curl http://localhost:3000/health/queues/all | jq '.queues[] | select(.active > 10)'
   ```

2. **Check worker health:**
   ```bash
   docker logs mailagent-backend --since 10m 2>&1 | grep -i "timeout\|stall"
   ```

### Resolution

1. **Restart application (graceful):**
   ```bash
   docker-compose restart backend
   ```

2. **If jobs truly stalled, clean active list:**
   ```bash
   docker exec mailagent-redis redis-cli DEL bull:<queue-name>:active
   ```
   > **Warning:** This may result in duplicate processing

3. **Increase job timeout if legitimately long-running:**
   - Edit job options with higher `timeout` value

---

## Queue Management Commands

### Using Bull Board
If Bull Board is enabled, access at `http://localhost:3000/admin/queues`

### Using Redis CLI

```bash
# Enter Redis container
docker exec -it mailagent-redis redis-cli

# List all queue keys
KEYS bull:*

# Check queue counts
LLEN bull:email-sync:wait
LLEN bull:email-sync:active
LLEN bull:email-sync:completed
LLEN bull:email-sync:failed

# View job details
HGETALL bull:email-sync:<job-id>

# Emergency: Clear a queue entirely
DEL bull:<queue-name>:wait bull:<queue-name>:active bull:<queue-name>:failed
```

---

## Escalation Path

1. **L1 - On-call Engineer:**
   - Restart services
   - Clear non-critical queues
   - Retry failed jobs

2. **L2 - Backend Team:**
   - Investigate code issues
   - Adjust queue configurations
   - Scale infrastructure

3. **L3 - Platform Team:**
   - Redis cluster issues
   - Infrastructure failures
   - Major outages
