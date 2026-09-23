import express from "express";
import { db } from "../db/index.ts";
import {
  classes,
  departments,
  enrollments,
  subjects,
  user,
} from "../db/schema/index.ts";
import { and, eq, getTableColumns, ilike, or, sql, desc } from "drizzle-orm";
import { cloudinary } from "../lib/cloudinary.ts";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { search, subject, teacher, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.min(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    );
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (search) {
      filterConditions.push(ilike(classes.name, `%${search}%`));
    }

    // if (subject) {
    //   filterConditions.push(ilike(subjects.name, `%${subject}%`));
    // }

    // if (teacher) {
    //   filterConditions.push(ilike(user.name, `%${teacher}%`));
    // }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        subject: {
          ...getTableColumns(subjects),
        },
        teacher: {
          ...getTableColumns(user),
        },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /classes error:", error);
    res.status(500).json({ error: "Failed to fetch classes" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      name,
      teacherId,
      subjectId,
      capacity,
      description,
      status,
      bannerUrl,
      bannerCldPubId,
    } = req.body;

    const [createdClass] = await db
      .insert(classes)
      .values({
        subjectId,
        inviteCode: Math.random().toString(36).substring(2, 9),
        name,
        teacherId,
        bannerCldPubId,
        bannerUrl,
        capacity,
        description,
        schedules: [],
        status,
      })
      .returning({ id: classes.id });

    if (!createdClass) throw Error;

    res.status(201).json({ data: createdClass });
  } catch (error) {
    console.error("POST /classes error:", error);
    res.status(500).json({ error: "Failed to create class" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const [existing] = await db
      .select({ bannerCldPubId: classes.bannerCldPubId })
      .from(classes)
      .where(eq(classes.id, classId));

    if (!existing) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Remove dependent enrollments first, unless your schema has ON DELETE CASCADE
    await db.delete(enrollments).where(eq(enrollments.classId, classId));

    const [deleted] = await db
      .delete(classes)
      .where(eq(classes.id, classId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Clean up the Cloudinary banner image after successful DB deletion
    if (existing.bannerCldPubId) {
      try {
        await cloudinary.uploader.destroy(existing.bannerCldPubId);
      } catch (cloudinaryError) {
        console.error(
          "Failed to delete Cloudinary banner on class delete:",
          cloudinaryError,
        );
      }
    }

    res.status(200).json({ data: deleted });
  } catch (error) {
    console.error("DELETE /classes/:id error:", error);
    res.status(500).json({ error: "Failed to delete class" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const [classDetails] = await db
      .select({
        ...getTableColumns(classes),
        subject: {
          ...getTableColumns(subjects),
        },
        department: {
          ...getTableColumns(departments),
        },
        teacher: {
          ...getTableColumns(user),
        },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(eq(classes.id, classId));

    if (!classDetails) {
      return res.status(404).json({ error: "Class not found" });
    }

    res.status(200).json({ data: classDetails });
  } catch (error) {
    console.error("GET /classes/:id error:", error);
    res.status(500).json({ error: "Failed to fetch class details" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const {
      name,
      teacherId,
      subjectId,
      capacity,
      description,
      status,
      bannerUrl,
      bannerCldPubId,
    } = req.body;

    // Fetch the existing record first so we know if the banner changed
    const [existing] = await db
      .select({ bannerCldPubId: classes.bannerCldPubId })
      .from(classes)
      .where(eq(classes.id, classId));

    if (!existing) {
      return res.status(404).json({ error: "Class not found" });
    }

    const [updated] = await db
      .update(classes)
      .set({
        name,
        teacherId,
        subjectId,
        capacity,
        description,
        status,
        bannerUrl,
        bannerCldPubId,
      })
      .where(eq(classes.id, classId))
      .returning();

    // If the banner was replaced (or removed), delete the old Cloudinary asset
    if (existing.bannerCldPubId && existing.bannerCldPubId !== bannerCldPubId) {
      try {
        await cloudinary.uploader.destroy(existing.bannerCldPubId);
      } catch (cloudinaryError) {
        // Don't fail the whole update if Cloudinary cleanup fails —
        // just log it so orphaned assets can be cleaned up later.
        console.error(
          "Failed to delete old Cloudinary banner:",
          cloudinaryError,
        );
      }
    }

    res.status(200).json({ data: updated });
  } catch (error) {
    console.error("PUT /classes/:id error:", error);
    res.status(500).json({ error: "Failed to update class" });
  }
});

export default router;
