import { db, properties, buildings, units } from "@hearthlane/db";
import { and, eq, isNull } from "drizzle-orm";
import { logAction } from "./audit";
import { PropertyCreateInput, BuildingCreateInput, UnitCreateInput } from "@hearthlane/validation";

export async function listProperties(orgId: string) {
  const props = await db.select()
    .from(properties)
    .where(and(eq(properties.orgId, orgId), isNull(properties.archivedAt)));

  const result = [];
  for (const p of props) {
    const propertyBuildings = await db.select()
      .from(buildings)
      .where(and(eq(buildings.propertyId, p.id), isNull(buildings.archivedAt)));

    const propertyUnits = await db.select()
      .from(units)
      .where(and(eq(units.propertyId, p.id), isNull(units.archivedAt)));

    result.push({
      ...p,
      buildings: propertyBuildings,
      units: propertyUnits,
    });
  }
  return result;
}

export async function getPropertyDetails(orgId: string, id: string) {
  const [property] = await db.select()
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.id, id), isNull(properties.archivedAt)));

  if (!property) return null;

  const propertyBuildings = await db.select()
    .from(buildings)
    .where(and(eq(buildings.propertyId, id), isNull(buildings.archivedAt)));

  const propertyUnits = await db.select()
    .from(units)
    .where(and(eq(units.propertyId, id), isNull(units.archivedAt)));

  return {
    ...property,
    buildings: propertyBuildings,
    units: propertyUnits,
  };
}

export async function createProperty(orgId: string, userId: string, input: PropertyCreateInput) {
  const [property] = await db.insert(properties).values({
    orgId,
    address: input.address,
    nickname: input.nickname,
    propertyType: input.propertyType,
    ownershipPercentage: input.ownershipPercentage,
    acquisitionDate: new Date(input.acquisitionDate),
    notes: input.notes || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "property",
    entityId: property.id,
    action: "create",
    newState: property,
  });

  return property;
}

export async function updateProperty(
  orgId: string,
  userId: string,
  id: string,
  input: Partial<PropertyCreateInput>
) {
  const [existing] = await db.select()
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.id, id), isNull(properties.archivedAt)));

  if (!existing) throw new Error("Property not found");

  const updateFields: any = {};
  if (input.address !== undefined) updateFields.address = input.address;
  if (input.nickname !== undefined) updateFields.nickname = input.nickname;
  if (input.propertyType !== undefined) updateFields.propertyType = input.propertyType;
  if (input.ownershipPercentage !== undefined) updateFields.ownershipPercentage = input.ownershipPercentage;
  if (input.acquisitionDate !== undefined) updateFields.acquisitionDate = new Date(input.acquisitionDate);
  if (input.notes !== undefined) updateFields.notes = input.notes || null;
  updateFields.updatedAt = new Date();

  const [updated] = await db.update(properties)
    .set(updateFields)
    .where(and(eq(properties.orgId, orgId), eq(properties.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "property",
    entityId: id,
    action: "update",
    previousState: existing,
    newState: updated,
  });

  return updated;
}

export async function archiveProperty(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.id, id), isNull(properties.archivedAt)));

  if (!existing) throw new Error("Property not found");

  const [archived] = await db.update(properties)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(properties.orgId, orgId), eq(properties.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "property",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}

// Buildings
export async function createBuilding(orgId: string, userId: string, input: BuildingCreateInput) {
  const [building] = await db.insert(buildings).values({
    orgId,
    propertyId: input.propertyId,
    name: input.name,
    address: input.address || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "building",
    entityId: building.id,
    action: "create",
    newState: building,
  });

  return building;
}

export async function archiveBuilding(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(buildings)
    .where(and(eq(buildings.orgId, orgId), eq(buildings.id, id), isNull(buildings.archivedAt)));

  if (!existing) throw new Error("Building not found");

  const [archived] = await db.update(buildings)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(buildings.orgId, orgId), eq(buildings.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "building",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}

// Units
export async function createUnit(orgId: string, userId: string, input: UnitCreateInput) {
  const [unit] = await db.insert(units).values({
    orgId,
    propertyId: input.propertyId,
    buildingId: input.buildingId || null,
    unitNumber: input.unitNumber,
    status: input.status,
    type: input.type,
    monthlyRent: Math.round(input.monthlyRent * 100), // convert to cents
    sizeSqFt: input.sizeSqFt || null,
  }).returning();

  await logAction({
    orgId,
    userId,
    entityType: "unit",
    entityId: unit.id,
    action: "create",
    newState: unit,
  });

  return unit;
}

export async function updateUnit(
  orgId: string,
  userId: string,
  id: string,
  input: Partial<UnitCreateInput>
) {
  const [existing] = await db.select()
    .from(units)
    .where(and(eq(units.orgId, orgId), eq(units.id, id), isNull(units.archivedAt)));

  if (!existing) throw new Error("Unit not found");

  const updateFields: any = {};
  if (input.unitNumber !== undefined) updateFields.unitNumber = input.unitNumber;
  if (input.status !== undefined) updateFields.status = input.status;
  if (input.type !== undefined) updateFields.type = input.type;
  if (input.monthlyRent !== undefined) updateFields.monthlyRent = Math.round(input.monthlyRent * 100);
  if (input.sizeSqFt !== undefined) updateFields.sizeSqFt = input.sizeSqFt;
  if (input.buildingId !== undefined) updateFields.buildingId = input.buildingId || null;
  updateFields.updatedAt = new Date();

  const [updated] = await db.update(units)
    .set(updateFields)
    .where(and(eq(units.orgId, orgId), eq(units.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "unit",
    entityId: id,
    action: "update",
    previousState: existing,
    newState: updated,
  });

  return updated;
}

export async function archiveUnit(orgId: string, userId: string, id: string) {
  const [existing] = await db.select()
    .from(units)
    .where(and(eq(units.orgId, orgId), eq(units.id, id), isNull(units.archivedAt)));

  if (!existing) throw new Error("Unit not found");

  const [archived] = await db.update(units)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(units.orgId, orgId), eq(units.id, id)))
    .returning();

  await logAction({
    orgId,
    userId,
    entityType: "unit",
    entityId: id,
    action: "archive",
    previousState: existing,
    newState: archived,
  });

  return archived;
}
