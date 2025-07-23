import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  max_participants: z.number().min(2, "Must allow at least 2 participants").max(100, "Maximum 100 participants"),
  is_public: z.boolean().default(false),
  start_time: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CreateDeliberationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeliberationCreated: () => void;
}

export function CreateDeliberationDialog({ 
  open, 
  onOpenChange, 
  onDeliberationCreated 
}: CreateDeliberationDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      max_participants: 20,
      is_public: false,
      start_time: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    try {
      setLoading(true);
      
      const deliberationData = {
        title: data.title,
        description: data.description,
        max_participants: data.max_participants,
        is_public: data.is_public,
        facilitator_id: user.id,
        status: (data.start_time ? 'active' : 'draft') as 'active' | 'draft',
        start_time: data.start_time || null,
      };

      const { data: deliberation, error } = await supabase
        .from('deliberations')
        .insert(deliberationData)
        .select()
        .single();

      if (error) throw error;

      // Automatically add the facilitator as a participant with facilitator role
      const { error: participantError } = await supabase
        .from('participants')
        .insert({
          deliberation_id: deliberation.id,
          user_id: user.id,
          role: 'facilitator'
        });

      if (participantError) throw participantError;

      toast({
        title: "Success",
        description: "Deliberation created successfully",
      });

      form.reset();
      onOpenChange(false);
      onDeliberationCreated();
    } catch (error) {
      console.error('Error creating deliberation:', error);
      toast({
        title: "Error",
        description: "Failed to create deliberation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Deliberation</DialogTitle>
          <DialogDescription>
            Set up a new structured democratic discussion for participants.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter deliberation title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe the topic and goals of this deliberation"
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="max_participants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Participants</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="2" 
                      max="100"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Set the maximum number of participants (2-100)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="start_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Time (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="datetime-local"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Leave empty to create as draft
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_public"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Public Deliberation</FormLabel>
                    <FormDescription>
                      Make this deliberation visible to all users
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Deliberation"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}