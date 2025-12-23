driver: IEmailDriver,
canonicalMsg: CanonicalMessage,
providerId: string,
tenantId: string,
): Promise<{ wasNew: boolean }> {
// Leggi il record attuale per controllare updatedAt
const current = await this.prisma.email.findFirst({
where: {
providerId,
externalId: canonicalMsg.id,
folder: canonicalMsg.folder,
},
select: { id: true, updatedAt: true },
});

if (current) {
// Se user ha modificato negli ultimi 2 secondi, skip update
const lastModifiedMs = Date.now() - current.updatedAt.getTime();
if (lastModifiedMs < 2000) {
this.logger.debug(
Skipping sync for ${canonicalMsg.id}: user modified ${lastModifiedMs}ms ago,
);
return { wasNew: false };
}
}

// Procedi con upsert
const result = await this.prisma.email.upsert({
// ...
});

return { wasNew: ... };
}

text

### Tempo di Fix
- **Con Versioning:** 3-4 ore (include migration + testing)
- **Con Grace Period:** 1-2 ore

---

## 🔴 RC-3: METADATA UPDATES NON-ATOMIC - CRITICA

**Severity:** 🔴 CRITICAL  
**Probability:** MEDIUM (durante carichi alti)  
**Data Corruption Risk:** HIGH (sync state stale)  
**User Impact:** Next sync è rotto o duplica messaggi

### Localizzazione
- File: `backend/src/modules/email-sync/workers/sync.worker.ts`
- Metodo: `processJob()` linea ~195-210

### Problema Tecnico

// ❌ BUGGY CODE - Tre transazioni separate!
try {
const result = await this.runProviderSync(job.data);

await this.applySyncState(providerId, metadataUpdates); // TX#1
await this.syncScheduler.updateProviderActivity(providerId); // TX#2
await this.folderSyncService.updateAllFolderCounts(providerId); // TX#3

return { success: true, ... };
} catch (error) {
// Ora se crash tra TX#1 e TX#2, lo stato è inc
