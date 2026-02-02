const mongoose = require('mongoose');

const shareEmailSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    toEmail: { type: String, required: true, trim: true, lowercase: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    model: { type: String, default: 'median', trim: true, lowercase: true },
    elevation: { type: String, default: 'mid', trim: true, lowercase: true },
    month: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

shareEmailSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ShareEmail', shareEmailSchema);
