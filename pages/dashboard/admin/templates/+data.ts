// No backend data needed for the simplified template system
// Templates are discovered automatically from the filesystem

export type Data = {
  success: boolean;
};

export default function data(): Data {
  return {
    success: true,
  };
}