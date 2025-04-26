import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
    },
  },
  { strict: false, _id: false }
);

const sportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    img: {
      type: String,
      default: "https://images.meebuddy.com/products/no_image.jpg",
    },
    liveEvents: {
      type: [eventSchema],
      default: [],
    },
    upcomingEvents: {
      type: [eventSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Sport", sportSchema);
