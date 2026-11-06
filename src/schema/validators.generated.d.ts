// Types of the validators compiled by scripts/gen-validators.mjs.
import type { ErrorObject } from "ajv/dist/2020";
type Validator = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };
declare const validators: { validateSchema: Validator; validateNode: Validator };
export default validators;
