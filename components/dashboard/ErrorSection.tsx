import { AlertCircle } from "lucide-react";

export function ErrorSection({ error }: { error: string }) {
  return (
    <section className='max-w-3xl text-center mx-auto py-10'>
      <AlertCircle className='w-20 h-20 bg-primary text-primary-foreground rounded-full p-4 mx-auto' />
      <h1 className='text-2xl font-bold mb-2'>Something went wrong</h1>
      <p>{error}</p>
    </section>
  );
}
