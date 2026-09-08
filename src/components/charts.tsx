import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { STATUS_LABEL, STATUS_ORDER, PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/types";
import type { Task } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  todo: "var(--muted-foreground)",
  in_progress: "var(--chart-1)",
  in_review: "var(--chart-2)",
  rejected: "var(--chart-5)",
  completed: "var(--chart-4)",
};

export function StatusPieChart({ tasks }: { tasks: Task[] }) {
  const data = STATUS_ORDER.map((s) => ({
    name: STATUS_LABEL[s],
    key: s,
    value: tasks.filter((t) => t.status === s).length,
  })).filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No tasks to chart yet.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={84}
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={STATUS_COLORS[d.key]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriorityBarChart({ tasks }: { tasks: Task[] }) {
  const data = PRIORITY_ORDER.map((p) => ({
    name: PRIORITY_LABEL[p],
    open: tasks.filter((t) => t.priority === p && t.status !== "completed").length,
    done: tasks.filter((t) => t.priority === p && t.status === "completed").length,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" width={24} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="open" name="Open" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
          <Bar dataKey="done" name="Done" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
