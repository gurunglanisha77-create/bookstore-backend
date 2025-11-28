// server.js
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config();

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json());
app.use(cors());

//---- Serve images here -----
app.use("/image", express.static(path.join(_dirname, "image")));

// ---------- Logger middleware ----------
app.use((req, res, next) => {
  const now = new Date().toISOString();

  const methodWithBody =['POST', 'PUT', 'PATCH'];
  const bodyInfo = methodWithBody.includes(req.method) ? ` - Body: ${JSON.stringify(req.body)}`: '';

  console.log(`[${now}] ${req.method} ${req.originalUrl}${bodyInfo}`);
  next();
});

// ---------- MongoDB connection ----------
let db;


async function connectDB() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db(process.env.DB_NAME);
    console.log("Connected successfully to MongoDB Atlas!");
    const collections = await db.listCollections().toArray();
    console.log("Collections in DB:", collections.map(c => c.name));
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}

// ---------- GET /api/lessons ----------
app.get("/api/lessons", async (req, res) => {
  try {
    const raw = await db.collection("lessons").find().toArray();
    // convert _id to string for client-side ease
    const lessons = raw.map(l => ({ ...l, _id: l._id.toString() }));
    res.json(lessons);
  } catch (err) {
    console.error("Error fetching lessons:", err);
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

// ---------- GET /api/search?q=term ----------
app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const regex = new RegExp(q, "i");
    const raw = await db.collection("lessons").find({
      $or: [
        { subject: regex },
        { location: regex },
        { instructor: regex },
        { description: regex },
        { schedule: regex },
      ]
    }).toArray();
    const results = raw.map(r => ({ ...r, _id: r._id.toString() }));
    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// ---------- POST /api/orders ----------
app.post("/api/orders", async (req, res) => {
  try {
    const { name, phone, items, totalPrice } = req.body;
    if (!name || !phone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Invalid order payload" });
    }

    // transform lessonId string to ObjectId for storage convenience or store as string
    const orderDoc = {
      name,
      phone,
      items: items.map(i=> ({ lessonId: i.lessonId, quantity: i.quantity, price: i.price })),
      totalPrice,
      createdAt: new Date()
    };

    const result = await db.collection("orders").insertOne(orderDoc);
    res.status(201).json({ insertedId: result.insertedId.toString() });
  } catch (err) {
    console.error("Error saving order:", err);
    res.status(500).json({ error: "Failed to save order" });
  }
});

// ---------- PUT /api/lessons/:id ----------
app.put("/api/lessons/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid lesson id" });

    const update = req.body; // allow any attribute updates, e.g. { spaces: 4 }
    // If front-end uses 'spaces' or 'space' be consistent. We'll accept either.
    // WARNING: do not allow updating _id via this route.
    if (update._id) delete update._id;

    const result = await db.collection("lessons").updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Lesson not found" });

    res.json({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("Error updating lesson:", err);
    res.status(500).json({ error: "Failed to update lesson" });
  }
});

// ---------- Root ----------
app.get("/", (req, res) => {
  res.send("Backend is running and ready!");
});

// Start
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await connectDB();
});

