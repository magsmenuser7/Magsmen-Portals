import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER } from "@/lib/types";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import type { TaskInput } from "@/lib/store";

const empty: TaskInput = {
  title: "",
  description: "",
  status: "todo",
  priority: "normal",
  assignee: "",
  clientName: "",
  dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  tags: [],
};

export function TaskDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
  onSubmit: (input: TaskInput) => void;
}) {
  const [form, setForm] = useState<TaskInput>(empty);
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee,
        clientName: task.clientName,
        dueDate: task.dueDate.slice(0, 10),
        tags: task.tags,
      });
      setTagText(task.tags.join(", "));
    } else {
      setForm(empty);
      setTagText("");
    }
    setError("");
  }, [open, task]);

  const submit = () => {
    if (form.title.trim().length < 3) {
      setError("Title needs at least 3 characters.");
      return;
    }
    onSubmit({
      ...form,
      title: form.title.trim().slice(0, 120),
      description: form.description.trim().slice(0, 1000),
      assignee: form.assignee.trim() || "Unassigned",
      clientName: form.clientName.trim() || "Internal",
      dueDate: new Date(form.dueDate).toISOString(),
      tags: tagText
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {task ? "Update the details and save your changes." : "Add a task to the delivery board."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              maxLength={120}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Short, action-oriented title"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              maxLength={1000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What needs to happen?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="assignee">Assignee</Label>
              <Input
                id="assignee"
                value={form.assignee}
                maxLength={60}
                onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                placeholder="Priya Nair"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                value={form.clientName}
                maxLength={60}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="Northwind Labs"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tagText}
                maxLength={80}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="frontend, billing"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{task ? "Save changes" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
