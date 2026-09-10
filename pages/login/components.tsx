import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Button } from "#root/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "#root/components/ui/form";
import { Input } from "#root/components/ui/input";
import { useState } from "react";

export type LoginOnSubmit = (
  values: z.infer<typeof formSchema>
) => PromiseLike<void>;

const formSchema = z.object({
  email: z.string(),
  password: z.string().min(1),
});

export default function LoginForm({ onSubmit }: { onSubmit: LoginOnSubmit }) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    disabled: submitting,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setSubmitting(true);
          await onSubmit(values);
          setSubmitting(false);
        })}
        className="space-y-4 max-w-3xl mx-auto w-full"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder="email@example.com"
                  type="email"
                  {...field}
                />
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          className="w-full"
          size={"lg"}
          type="submit"
          disabled={submitting}
        >
          Login
        </Button>
      </form>
    </Form>
  );
}
