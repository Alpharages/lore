import { createAdminDb } from "../db/client.js";
import { getPropagationById } from "../repositories/propagation.repository.js";
import { acceptPropagation, rejectPropagation } from "./propagation.js";
import { notFoundError } from "../utils/errors.js";

export const adminAcceptPropagationService = async (
  propagationId: string
): Promise<{ newLessonId: string }> => {
  const admin = await createAdminDb();
  try {
    const propagation = await getPropagationById(admin.db, propagationId);
    if (!propagation) {
      throw notFoundError(`Propagation ${propagationId} not found`);
    }
    return acceptPropagation(admin.db, propagationId, propagation.targetProjectId);
  } finally {
    await admin.release();
  }
};

export const adminRejectPropagationService = async (propagationId: string): Promise<void> => {
  const admin = await createAdminDb();
  try {
    const propagation = await getPropagationById(admin.db, propagationId);
    if (!propagation) {
      throw notFoundError(`Propagation ${propagationId} not found`);
    }
    await rejectPropagation(admin.db, propagationId, propagation.targetProjectId);
  } finally {
    await admin.release();
  }
};
