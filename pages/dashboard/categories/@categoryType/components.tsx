"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { FileUploadInput } from "#root/components/file-uploads/FileUpload";

const formSchema = z.object({
  id: z.string().uuid().optional().catch(undefined),
  name: z.string().nonempty().max(255),
  imageId: z.string().uuid(),
  type: z.string().nonempty().max(255),
});

export type SubCategoryFormSchema = z.infer<typeof formSchema>;

export default function SubCategoryForm({
  defaultValues,
  onSubmit,
  type,
}: {
  defaultValues?: SubCategoryFormSchema;
  onSubmit: (values: SubCategoryFormSchema) => PromiseLike<void>;
  type: string;
}) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8 py-10'>
        <input type='hidden' {...form.register("id")} />
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder='Shirts, Pants, etc'
                  type='text'
                  {...field}
                />
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='imageId'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image</FormLabel>
              <FormControl>
                <FileUploadInput id='image' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <input type='hidden' value={type} {...form.register("type")} />
        <Button type='submit' className='w-full'>
          Submit
        </Button>
      </form>
    </Form>
  );
}
