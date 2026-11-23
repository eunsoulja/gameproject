import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, unique: true, index: true },
    nameKey: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    token: { type: String, required: true },
    profile: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

const transactionSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, index: true },
    kind: { type: String, required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    note: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const dailyReportSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, index: true },
    day: { type: Number, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

const plotSchema = new mongoose.Schema(
  {
    plotIndex: { type: Number, required: true, unique: true },
    ownerId: { type: String, required: true, index: true },
    ownerName: { type: String, required: true },
    businessName: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false },
);

export const PlayerModel = mongoose.models.Player ?? mongoose.model('Player', playerSchema);
export const TransactionModel =
  mongoose.models.Transaction ?? mongoose.model('Transaction', transactionSchema);
export const DailyReportModel =
  mongoose.models.DailyReport ?? mongoose.model('DailyReport', dailyReportSchema);
export const PlotModel = mongoose.models.Plot ?? mongoose.model('Plot', plotSchema);
