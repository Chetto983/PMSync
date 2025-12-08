# Redis Operations Runbook

This runbook provides operational guidance for managing PmSync's Redis instance.

## Quick Reference

| Config | Development | Production |
|--------|-------------|------------|
| Host | `localhost` | `redis.internal` |
| Port | `6379` | `6379` |
| TLS | Disabled | **Enabled** |
| Max Memory | 256MB | 512MB+ |
| Eviction Policy | `noeviction` | `volatile-lru` |

## Health Checks

```bash
# Ping Redis
docker exec mailagent-redis redis-cli PING

# Connection info
docker exec mailagent-redis redis-cli CLIENT LIST

# Memory usage
docker exec mailagent-redis redis-cli INFO memory

# All queue health via API
curl http://localhost:3000/health/queues/all | jq '.redis'
```

---

## Runbook: High Latency

### Symptoms
- Alert: `RedisHighLatency` (>100ms) or `RedisLatencyWarning` (>50ms)
- Slow API responses
- Queue processing delays

### Diagnosis

1. **Check Redis latency directly:**
   ```bash
   docker exec mailagent-redis redis-cli --latency
   ```

2. **Check for slow commands:**
   ```bash
   docker exec mailagent-redis redis-cli SLOWLOG GET 10
   ```

3. **Check network between app and Redis:**
   ```bash
   docker exec mailagent-backend ping redis -c 5
   ```

4. **Check if Redis is swapping:**
   ```bash
   docker exec mailagent-redis redis-cli INFO stats | grep -i sync
   ```

### Resolution

1. **Clear slow log and monitor:**
   ```bash
   docker exec mailagent-redis redis-cli SLOWLOG RESET
   ```

2. **If network issue, check Docker networking:**
   ```bash
   docker network inspect mailagent_default
   ```

3. **If slow commands, identify and optimize:**
   - Avoid `KEYS *` in production
   - Use `SCAN` instead
   - Review BullMQ patterns

4. **Restart Redis if stuck:**
   ```bash
   docker-compose restart redis
   ```

### Prevention
- Use Redis Cluster for high availability
- Enable slowlog monitoring
- Set up Redis Sentinel for failover

---

## Runbook: Memory Pressure

### Symptoms
- Alert: `RedisMemoryCritical` (>512MB) or `RedisMemoryWarning` (>256MB)
- Redis rejecting writes
- OOM errors in logs

### Diagnosis

1. **Check memory breakdown:**
   ```bash
   docker exec mailagent-redis redis-cli INFO memory
   ```

2. **Find largest keys:**
   ```bash
   docker exec mailagent-redis redis-cli --bigkeys
   ```

3. **Check key count by pattern:**
   ```bash
   docker exec mailagent-redis redis-cli EVAL "return #redis.call('keys','bull:*')" 0
   ```

### Resolution

1. **Identify memory consumers:**
   ```bash
   docker exec mailagent-redis redis-cli DEBUG OBJECT bull:email-sync:completed
   ```

2. **Clear completed jobs (safe):**
   ```bash
   docker exec mailagent-redis redis-cli DEL bull:email-sync:completed
   docker exec mailagent-redis redis-cli DEL bull:embedding:completed
   ```

3. **Clear old failed jobs:**
   ```bash
   docker exec mailagent-redis redis-cli DEL bull:email-sync:failed
   ```

4. **If embedding cache too large:**
   - Run embedding cleanup job
   - Reduce TTL on cached items

5. **Emergency: Flush all (DATA LOSS):**
   ```bash
   # WARNING: Clears ALL data
   docker exec mailagent-redis redis-cli FLUSHALL
   ```

### Prevention
- Set `maxmemory` and `maxmemory-policy`
- Configure job retention (keepCompleted, keepFailed)
- Schedule regular cleanup jobs
- Monitor memory trends in Grafana

---

## Runbook: Connection Sprawl

### Symptoms
- Alert: `RedisConnectionsHigh` (>100 clients)
- Redis refusing new connections
- Application connection errors

### Diagnosis

1. **List all clients:**
   ```bash
   docker exec mailagent-redis redis-cli CLIENT LIST
   ```

2. **Count connections by name/pattern:**
   ```bash
   docker exec mailagent-redis redis-cli CLIENT LIST | grep -c "mailagent"
   ```

3. **Check max clients setting:**
   ```bash
   docker exec mailagent-redis redis-cli CONFIG GET maxclients
   ```

### Resolution

1. **Kill idle connections:**
   ```bash
   # Kill connections idle > 300 seconds
   docker exec mailagent-redis redis-cli CLIENT KILL TYPE normal SKIPME yes
   ```

2. **Review application connection pooling:**
   - MailAgent uses shared connection singleton
   - Each queue should reuse connection
   - Check for connection leaks in code

3. **Restart application to reset connections:**
   ```bash
   docker-compose restart backend
   ```

4. **Increase maxclients (temporary):**
   ```bash
   docker exec mailagent-redis redis-cli CONFIG SET maxclients 500
   ```

### Prevention
- Use `getSharedRedisConnection()` pattern
- Set connection timeouts
- Monitor connection count in Grafana
- Implement connection pooling

---

## Runbook: Redis Down

### Symptoms
- Redis not responding to PING
- Application fails to start
- All queue operations failing

### Diagnosis

1. **Check container status:**
   ```bash
   docker ps | grep redis
   docker logs mailagent-redis --tail 50
   ```

2. **Check disk space (if persistence enabled):**
   ```bash
   docker exec mailagent-redis df -h
   ```

3. **Check for OOM kill:**
   ```bash
   dmesg | grep -i redis
   ```

### Resolution

1. **Restart Redis container:**
   ```bash
   docker-compose restart redis
   ```

2. **If persistence issue, disable temporarily:**
   ```bash
   docker exec mailagent-redis redis-cli CONFIG SET save ""
   ```

3. **If data corrupted, start fresh:**
   ```bash
   docker-compose down
   docker volume rm mailagent_redis-data
   docker-compose up -d redis
   ```

4. **Restore from backup (if available):**
   ```bash
   docker cp backup.rdb mailagent-redis:/data/dump.rdb
   docker-compose restart redis
   ```

---

## Redis TLS Configuration

### Enabling TLS (Production)

Set environment variables:
```bash
REDIS_TLS_ENABLED=true
REDIS_TLS_REJECT_UNAUTHORIZED=true
REDIS_TLS_CA=/path/to/ca.crt
REDIS_TLS_CERT=/path/to/client.crt
REDIS_TLS_KEY=/path/to/client.key
```

### Testing TLS Connection
```bash
redis-cli --tls --cacert /path/to/ca.crt -h redis.internal -p 6379 PING
```

---

## Useful Redis Commands

```bash
# Enter Redis CLI
docker exec -it mailagent-redis redis-cli

# Server info
INFO

# Memory stats
INFO memory
MEMORY STATS

# Client connections
CLIENT LIST
CLIENT KILL TYPE normal SKIPME yes

# Key operations
KEYS bull:*
SCAN 0 MATCH bull:* COUNT 100
TYPE bull:email-sync:wait
TTL bull:email-sync:completed:1234

# Queue inspection
LLEN bull:email-sync:wait
LRANGE bull:email-sync:wait 0 10

# Performance
SLOWLOG GET 10
SLOWLOG RESET
MONITOR  # Real-time command stream (use sparingly)

# Configuration
CONFIG GET maxmemory
CONFIG SET maxmemory 256mb
```

---

## Escalation Path

1. **L1 - On-call Engineer:**
   - Restart Redis
   - Clear completed/failed jobs
   - Kill idle connections

2. **L2 - Backend Team:**
   - Connection pool tuning
   - Memory optimization
   - Queue configuration changes

3. **L3 - Platform Team:**
   - Redis Cluster management
   - Persistence/backup issues
   - Infrastructure scaling
