
import express from "express";
import cors from "cors";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { createAuth } from "./config/auth.js";
import "dotenv/config";
import { connectToMongoDB, getDB } from "./config/mongodb.js";
import { ObjectId } from "mongodb";
import multer from "multer";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 5000;

let auth;
let authHandler;
let initializationPromise;

const JWT_COOKIE_NAME = "studiospace_token";

// JWT cookie options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "none",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

// Create JWT token
const createJWT = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  },
});

// Middleware
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://studiospace-client-sandy.vercel.app",
  ],
  credentials: true,
}));


app.use(cookieParser());

const jsonParser = express.json();

app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth/")) {
    return next();
  }

  jsonParser(req, res, next);
});

// Initialize MongoDB and Better Auth for Vercel
async function initializeServer() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing");
      }

      await connectToMongoDB();

      auth = createAuth();
      authHandler = toNodeHandler(auth);
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

app.use(async (req, res, next) => {
  try {
    await initializeServer();
    next();
  } catch (error) {
    console.error("Server Initialization Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server initialization failed",
    });
  }
});

// Verify JWT token from HTTPOnly cookie
const requireAuth = (req, res, next) => {
  try {
    const token = req.cookies?.[JWT_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Please login to continue",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
    };

    next();
  } catch (error) {
    console.error("JWT Authentication Error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Unauthorized access. Please login again.",
    });
  }
};

// Better Auth routes
app.all("/api/auth/*splat", (req, res) => {
  return authHandler(req, res);
});

// Create JWT after Better Auth session verification
app.post("/auth/jwt", async (req, res) => {
  try {
    if (!auth) {
      return res.status(503).json({
        success: false,
        message: "Authentication service is not ready",
      });
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Please login first",
      });
    }

    const token = createJWT(session.user);

    res.cookie("studiospace_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log("JWT cookie set for:", session.user.email);

    return res.status(200).json({
      success: true,
      message: "JWT created successfully",
    });
  } catch (error) {
    console.error("JWT Creation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create JWT",
    });
  }
});

// Logout and clear JWT cookie
app.post("/auth/logout", (req, res) => {
  res.clearCookie(JWT_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});


// Upload image - Only logged-in users
app.post(
  "/upload-image",
  requireAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select an image",
        });
      }

      const apiKey = process.env.IMGBB_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message: "ImgBB API key is not configured",
        });
      }

      const formData = new FormData();
      const base64Image = req.file.buffer.toString("base64");

      formData.append("image", base64Image);

      const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${apiKey}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        return res.status(500).json({
          success: false,
          message: "Image upload failed",
        });
      }

      return res.status(200).json({
        success: true,
        imageUrl: result.data.url,
        message: "Image uploaded successfully",
      });
    } catch (error) {
      console.error("Image Upload Error:", error);

      return res.status(500).json({
        success: false,
        message: "Something went wrong while uploading image",
      });
    }
  }
);

// Home route
app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// ==================== STUDIO APIs ====================

// Get all studios
app.get("/studios", async (req, res) => {
  try {
    const db = getDB();

    const studios = await db
      .collection("studios")
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Studios fetched successfully",
      data: studios,
    });
  } catch (error) {
    console.error("GET STUDIOS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch studios",
    });
  }
});

// Get featured studios
app.get("/featured-studios", async (req, res) => {
  try {
    const db = getDB();

    const studios = await db
      .collection("studios")
      .find({ isFeatured: true })
      .limit(6)
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Featured studios fetched successfully",
      data: studios,
    });
  } catch (error) {
    console.error("GET FEATURED STUDIOS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch studios",
    });
  }
});

// Get single studio
app.get("/studios/:id", async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(id),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Studio fetched successfully",
      data: studio,
    });
  } catch (error) {
    console.error("GET SINGLE STUDIO ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch studio",
    });
  }
});

// Add studio - Only logged-in users
app.post("/studios", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const studioData = {
      ...req.body,
      hostName: req.user.name,
      hostEmail: req.user.email,
      isFeatured: false,
      createdAt: new Date(),
    };

    const result = await db.collection("studios").insertOne(studioData);

    return res.status(201).json({
      success: true,
      message: "Studio added successfully",
      data: result,
    });
  } catch (error) {
    console.error("Add Studio Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add studio",
    });
  }
});

// Update studio - Only owner can update
app.put("/studios/:id", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const updatedData = { ...req.body };

    delete updatedData.hostEmail;
    delete updatedData.hostName;
    delete updatedData._id;

    const result = await db.collection("studios").updateOne(
      {
        _id: new ObjectId(id),
        hostEmail: req.user.email,
      },
      {
        $set: updatedData,
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Studio not found or you are not the owner",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Studio updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update Studio Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update studio",
    });
  }
});

// Delete studio - Only owner can delete
app.delete("/studios/:id", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const result = await db.collection("studios").deleteOne({
      _id: new ObjectId(id),
      hostEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Studio not found or you are not the owner",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Studio deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("Delete Studio Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete studio",
    });
  }
});

// ==================== WISHLIST APIs ====================

// Add studio to wishlist
app.post("/wishlist", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { studioId } = req.body;

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found",
      });
    }

    const wishlistCollection = db.collection("wishlists");

    const existing = await wishlistCollection.findOne({
      userEmail: req.user.email,
      studioId: studioId,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Studio is already in your wishlist",
      });
    }

    const wishlistData = {
      userEmail: req.user.email,
      studioId: studioId,
      createdAt: new Date(),
    };

    const result = await wishlistCollection.insertOne(wishlistData);

    return res.status(201).json({
      success: true,
      message: "Studio added to wishlist",
      data: result,
    });
  } catch (error) {
    console.error("ADD WISHLIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add studio to wishlist",
    });
  }
});

// Get my wishlist
app.get("/wishlist", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const wishlist = await db
      .collection("wishlists")
      .aggregate([
        {
          $match: {
            userEmail: req.user.email,
          },
        },
        {
          $addFields: {
            studioObjectId: {
              $toObjectId: "$studioId",
            },
          },
        },
        {
          $lookup: {
            from: "studios",
            localField: "studioObjectId",
            foreignField: "_id",
            as: "studio",
          },
        },
        {
          $unwind: "$studio",
        },
        {
          $project: {
            _id: 1,
            studioId: 1,
            createdAt: 1,
            studio: 1,
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Wishlist fetched successfully",
      data: wishlist,
    });
  } catch (error) {
    console.error("GET WISHLIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch wishlist",
    });
  }
});

// Remove studio from wishlist
app.delete("/wishlist/:studioId", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { studioId } = req.params;

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const result = await db.collection("wishlists").deleteOne({
      userEmail: req.user.email,
      studioId: studioId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Studio not found in your wishlist",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Studio removed from wishlist",
    });
  } catch (error) {
    console.error("REMOVE WISHLIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove studio from wishlist",
    });
  }
});

// ==================== BOOKING APIs ====================

// Create booking - Only logged-in users

app.post("/bookings", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { studioId, bookingDate, startTime, duration } = req.body;

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio not found",
      });
    }

    // Validate booking date
    const isValidDate =
      typeof bookingDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(bookingDate) &&
      !Number.isNaN(Date.parse(bookingDate)) &&
      new Date(bookingDate).toISOString().slice(0, 10) === bookingDate;

    const hours = Number(duration);
    const timeParts = String(startTime).split(":").map(Number);

    if (
      !isValidDate ||
      timeParts.length !== 2 ||
      !timeParts.every(Number.isInteger) ||
      timeParts[0] < 0 ||
      timeParts[0] > 23 ||
      timeParts[1] < 0 ||
      timeParts[1] > 59 ||
      !Number.isFinite(hours) ||
      hours <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking date, time, or duration",
      });
    }

    // Convert booking time into minutes
    const newStart = timeParts[0] * 60 + timeParts[1];
    const newEnd = newStart + hours * 60;

    if (newEnd > 24 * 60) {
      return res.status(400).json({
        success: false,
        message: "Booking cannot extend beyond midnight",
      });
    }

    // Find existing confirmed bookings
    const confirmedBookings = await db
      .collection("bookings")
      .find({
        studioId: studio._id.toString(),
        bookingDate,
        status: "Confirmed",
      })
      .toArray();

    // Check whether the new booking overlaps
    const hasConflict = confirmedBookings.some((booking) => {
      const [existingHour, existingMinute] = booking.startTime
        .split(":")
        .map(Number);

      const existingStart = existingHour * 60 + existingMinute;
      const existingEnd =
        existingStart + Number(booking.duration) * 60;

      return newStart < existingEnd && newEnd > existingStart;
    });

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        message:
          "This studio is already booked for the selected time. Please choose another time.",
      });
    }

    const bookingData = {
      studioId: studio._id.toString(),
      studioTitle: studio.title,
      studioImage: studio.imageUrl,
      userName: req.user.name,
      userEmail: req.user.email,
      bookingDate,
      startTime,
      duration: hours,
      totalPrice: studio.hourlyRate * hours,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await db.collection("bookings").insertOne(bookingData);

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Create Booking Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking",
    });
  }
});


// Get user bookings - Only own bookings
app.get("/bookings", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const bookings = await db
      .collection("bookings")
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Bookings fetched successfully",
      data: bookings,
    });
  } catch (error) {
    console.error("Get User Bookings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
    });
  }
});

// Get single booking for invoice - Only booking owner
app.get("/bookings/:id", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(id),
      userEmail: req.user.email,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking.status !== "Confirmed") {
      return res.status(400).json({
        success: false,
        message: "Invoice is available only for confirmed bookings",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice details fetched successfully",
      data: booking,
    });
  } catch (error) {
    console.error("GET INVOICE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch invoice details",
    });
  }
});

// Cancel booking - Only booking owner can cancel
app.patch("/bookings/:id", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(id),
        userEmail: req.user.email,
        status: "Pending",
      },
      {
        $set: { status: "Cancelled" },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or cannot be cancelled",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      data: result,
    });
  } catch (error) {
    console.error("Cancel Booking Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
    });
  }
});

// ==================== HOST APIs ====================

// Get my studio listings - Only own studios
app.get("/my-studios", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const studios = await db
      .collection("studios")
      .find({ hostEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "My studios fetched successfully",
      data: studios,
    });
  } catch (error) {
    console.error("Get My Studios Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your studios",
    });
  }
});

// Update booking status - Only studio owner can update
app.patch("/host-bookings/:id", requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
    }

    if (!["Confirmed", "Cancelled", "Completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking status",
      });
    }

    const currentStatus =
      status === "Completed" ? "Confirmed" : "Pending";

    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(id),
      status: currentStatus,
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or status cannot be updated",
      });
    }

    if (!ObjectId.isValid(booking.studioId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(booking.studioId),
      hostEmail: req.user.email,
    });

    if (!studio) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this booking",
      });
    }

    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(id),
        status: currentStatus,
      },
      {
        $set: { status },
      }
    );

    return res.status(200).json({
      success: true,
      message: `Booking ${status.toLowerCase()} successfully`,
      data: result,
    });
  } catch (error) {
    console.error("Host Booking Update Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update booking",
    });
  }
});

// Get bookings for my studios - Only own studio bookings
app.get("/host-bookings", requireAuth, async (req, res) => {
  try {
    const db = getDB();

    const studios = await db
      .collection("studios")
      .find({ hostEmail: req.user.email })
      .toArray();

    const studioIds = studios.map((studio) => studio._id.toString());

    const bookings = await db
      .collection("bookings")
      .find({ studioId: { $in: studioIds } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: "Host bookings fetched successfully",
      data: bookings,
    });

  } catch (error) {
    console.error("Host Bookings Fetch Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch host bookings",
    });
  }
});


// Vercel Serverless Export
export default app;
