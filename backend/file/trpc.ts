import { t } from "#root/shared/trpc/server";
import { uploadFileProcedure } from "./upload-file/trpc";

export const fileRouter = t.router({
  upload: uploadFileProcedure,
});
