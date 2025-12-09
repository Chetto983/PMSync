import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from './scheduled-jobs.queue';

/**
 * Servizio per la gestione della rotazione e pulizia dei log
 *
 * Features:
 * - Rotazione automatica ogni giorno a mezzanotte
 * - Eliminazione file più vecchi di 2 giorni (FIFO)
 * - Gestione errori robusta
 */
@Injectable()
export class LogRotationService implements OnModuleInit {
  private readonly logger = new Logger(LogRotationService.name);
  private readonly logDir = process.env.LOG_DIR || join(process.cwd(), 'logs');
  private readonly retentionDays = 2; // FIFO di 2 giorni

  constructor(private readonly scheduledJobsQueue: ScheduledJobsQueueService) {}

  async onModuleInit() {
    // Verifica che la directory log esista
    await this.ensureLogDirectory();

    // Register handler for log rotation with BullMQ
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.LOG_ROTATION,
      async () => this.cleanOldLogs(),
    );

    this.logger.log('LogRotationService registered with BullMQ scheduler');

    // Esegui pulizia all'avvio
    await this.cleanOldLogs();
  }

  /**
   * Assicura che la directory dei log esista
   */
  private async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.logger.log(`Log directory ready: ${this.logDir}`);
    } catch (error) {
      this.logger.error(`Failed to create log directory: ${error}`);
    }
  }

  /**
   * Log cleanup - triggered by BullMQ daily at midnight
   * Elimina log più vecchi di 2 giorni
   */
  async cleanOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    this.logger.log(
      `Starting log cleanup - removing files older than ${cutoffDate.toISOString()}`,
    );

    try {
      const files = await fs.readdir(this.logDir);
      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        // Processa solo file .log
        if (!file.endsWith('.log')) {
          continue;
        }

        const filePath = join(this.logDir, file);

        try {
          const stats = await fs.stat(filePath);

          // Controlla se il file è più vecchio del cutoff
          if (stats.mtime < cutoffDate) {
            totalSize += stats.size;
            await fs.unlink(filePath);
            deletedCount++;
            this.logger.log(
              `Deleted old log file: ${file} (${this.formatBytes(stats.size)}, modified: ${stats.mtime.toISOString()})`,
            );
          }
        } catch (error) {
          this.logger.warn(`Failed to process file ${file}: ${error}`);
        }
      }

      if (deletedCount > 0) {
        this.logger.log(
          `Log cleanup complete - deleted ${deletedCount} file(s), freed ${this.formatBytes(totalSize)}`,
        );
      } else {
        this.logger.log('Log cleanup complete - no old files to delete');
      }

      // Log statistiche directory
      await this.logDirectoryStats();
    } catch (error) {
      this.logger.error(`Log cleanup failed: ${error}`);
    }
  }

  /**
   * Rotazione manuale del log corrente
   * Crea un nuovo file con timestamp
   */
  async rotateCurrentLog() {
    const currentLogPath = join(this.logDir, 'app.log');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedLogPath = join(this.logDir, `app-${timestamp}.log`);

    try {
      // Verifica se il file corrente esiste
      await fs.access(currentLogPath);

      // Rinomina il file corrente
      await fs.rename(currentLogPath, rotatedLogPath);

      this.logger.log(`Log file rotated: ${rotatedLogPath}`);

      // Cleanup automatico dopo rotazione
      await this.cleanOldLogs();
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.error(`Failed to rotate log file: ${error}`);
      }
    }
  }

  /**
   * Statistiche directory log
   */
  private async logDirectoryStats() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter((f) => f.endsWith('.log'));
      let totalSize = 0;

      for (const file of logFiles) {
        const stats = await fs.stat(join(this.logDir, file));
        totalSize += stats.size;
      }

      this.logger.log(
        `Log directory stats: ${logFiles.length} file(s), total size: ${this.formatBytes(totalSize)}`,
      );
    } catch (error) {
      this.logger.warn(`Failed to get directory stats: ${error}`);
    }
  }

  /**
   * Formatta bytes in formato leggibile
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Ottieni lista dei file di log correnti
   */
  async getLogFiles(): Promise<
    Array<{ name: string; size: number; modified: Date }>
  > {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter((f) => f.endsWith('.log'));

      const fileInfos = await Promise.all(
        logFiles.map(async (file) => {
          const stats = await fs.stat(join(this.logDir, file));
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
          };
        }),
      );

      return fileInfos.sort(
        (a, b) => b.modified.getTime() - a.modified.getTime(),
      );
    } catch (error) {
      this.logger.error(`Failed to get log files: ${error}`);
      return [];
    }
  }
}
