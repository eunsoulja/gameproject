import mongoose from 'mongoose';
import { SERVER_CONFIG } from '../config';
import { DailyReportModel, PlayerModel, PlotModel, TransactionModel } from '../models/index';
import type { DailyReport, PlayerProfile, PublicPlot } from '../../../shared/types';

export interface StoredProfile {
  playerId: string;
  nameKey: string;
  name: string;
  token: string;
  profile: PlayerProfile;
}

/**
 * Persistence layer. MongoDB is used when MONGODB_URI is configured.
 * A memory store keeps local/demo play fully functional without a database.
 */
export class SaveService {
  private mongoReady = false;
  private memory = new Map<string, StoredProfile>();
  private transactionWrites = 0;

  get usingMongo(): boolean {
    return this.mongoReady;
  }

  async init(): Promise<void> {
    if (!SERVER_CONFIG.mongoUri) {
      console.warn('[db] MONGODB_URI is not set — using the in-memory store. Progress lasts until the server restarts.');
      return;
    }
    try {
      mongoose.set('strictQuery', true);
      await mongoose.connect(SERVER_CONFIG.mongoUri, {
        serverSelectionTimeoutMS: 7000,
        maxPoolSize: 10,
      });
      this.mongoReady = true;
      console.log('[db] MongoDB connected');
    } catch (error) {
      this.mongoReady = false;
      console.error('[db] MongoDB connection failed; running with the in-memory store.', error);
    }
  }

  async loadAll(): Promise<StoredProfile[]> {
    if (!this.mongoReady) return [...this.memory.values()];
    const docs = await PlayerModel.find({}).lean();
    const results: StoredProfile[] = [];
    for (const doc of docs as any[]) {
      if (!doc?.profile || !doc?.playerId || !doc?.token) continue;
      this.memory.set(doc.playerId, {
        playerId: doc.playerId,
        nameKey: doc.nameKey,
        name: doc.name,
        token: doc.token,
        profile: doc.profile as PlayerProfile,
      });
      results.push(this.memory.get(doc.playerId)!);
    }
    console.log(`[db] Loaded ${results.length} player profile(s)`);
    return results;
  }

  upsertMemory(record: StoredProfile): void {
    this.memory.set(record.playerId, record);
  }

  async save(record: StoredProfile): Promise<void> {
    this.memory.set(record.playerId, record);
    if (!this.mongoReady) return;
    try {
      await PlayerModel.updateOne(
        { playerId: record.playerId },
        {
          $set: {
            playerId: record.playerId,
            nameKey: record.nameKey,
            name: record.name,
            token: record.token,
            profile: record.profile,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      console.error('[db] Failed to save profile', record.profile?.name, error);
    }
  }

  recordTransaction(playerId: string, kind: string, amount: number, balanceAfter: number, note = '', meta: unknown = {}): void {
    if (!this.mongoReady) return;
    this.transactionWrites++;
    void TransactionModel.create({ playerId, kind, amount, balanceAfter, note, meta }).catch((error) => {
      console.error('[db] Failed to write transaction', error);
    });
  }

  recordDailyReport(playerId: string, report: DailyReport): void {
    if (!this.mongoReady) return;
    void DailyReportModel.create({ playerId, day: report.day, data: report }).catch((error) => {
      console.error('[db] Failed to write daily report', error);
    });
  }

  savePlot(plot: PublicPlot): void {
    if (!this.mongoReady) return;
    void PlotModel.updateOne(
      { plotIndex: plot.index },
      {
        $set: {
          plotIndex: plot.index,
          ownerId: plot.ownerId,
          ownerName: plot.ownerName,
          businessName: plot.businessName,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    ).catch((error) => console.error('[db] Failed to save plot', error));
  }

  get mongoStatus(): string {
    if (!SERVER_CONFIG.mongoUri) return 'memory';
    return this.mongoReady ? 'mongodb' : 'memory (mongo unavailable)';
  }

  get stats(): { transactions: number } {
    return { transactions: this.transactionWrites };
  }

  async close(): Promise<void> {
    if (this.mongoReady) await mongoose.disconnect();
  }
}
