import {
  attributeSetCreateSchema,
  attributeSetUpdateSchema,
  type AttributeSet,
  type AttributeSetCreateInput,
  type AttributeSetUpdateInput,
} from "@pim/shared";
import { AppError, notFound } from "../../lib/errors";
import { attributeSetRepo } from "./repo";

const nameTaken = (name: string) =>
  new AppError("NAME_TAKEN", 409, `An attribute set named "${name}" already exists`, {
    fieldErrors: { name: "This name is already in use" },
  });

export const attributeSetService = {
  list: (): AttributeSet[] => attributeSetRepo.list(),

  get(id: number): AttributeSet {
    const set = attributeSetRepo.findById(id);
    if (!set) throw notFound("Attribute set", id);
    return set;
  },

  create(input: AttributeSetCreateInput): AttributeSet {
    const data = attributeSetCreateSchema.parse(input);
    if (attributeSetRepo.findByName(data.name)) throw nameTaken(data.name);
    return attributeSetRepo.insert(data);
  },

  update(id: number, input: AttributeSetUpdateInput): AttributeSet {
    this.get(id);
    const data = attributeSetUpdateSchema.parse(input);
    if (data.name) {
      const clash = attributeSetRepo.findByName(data.name);
      if (clash && clash.id !== id) throw nameTaken(data.name);
    }
    return attributeSetRepo.update(id, data);
  },

  /** Products keep their attributes; they just stop referencing the set (FK ON DELETE SET NULL). */
  remove(id: number): { id: number; detachedProducts: number } {
    const set = this.get(id);
    attributeSetRepo.delete(id);
    return { id, detachedProducts: set.productCount };
  },
};
