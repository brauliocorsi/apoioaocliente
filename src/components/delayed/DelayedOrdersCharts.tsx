import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { differenceInBusinessDays, parseISO, format, startOfWeek, addWeeks } from "date-fns";
import { pt } from "date-fns/locale";

type DelayedOrder = {
  id: string;
  order_number: string;
  order_date: string | null;
  situacao: string | null;
  created_at: string;
};

type OrderContact = {
  id: string;
  delayed_order_id: string;
  contacted_at: string;
};

interface DelayedOrdersChartsProps {
  orders: DelayedOrder[];
  contacts: Record<string, OrderContact[]>;
}

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(45, 93%, 47%)",
  "hsl(25, 95%, 53%)",
  "hsl(var(--destructive))",
];

const barChartConfig: ChartConfig = {
  normal: { label: "Normal", color: "hsl(var(--primary))" },
  attention: { label: "Atenção", color: "hsl(45, 93%, 47%)" },
  alert: { label: "Alerta", color: "hsl(25, 95%, 53%)" },
  critical: { label: "Vencidas", color: "hsl(var(--destructive))" },
};

const situacaoChartConfig: ChartConfig = {
  count: { label: "Encomendas", color: "hsl(var(--primary))" },
};

const contactChartConfig: ChartConfig = {
  contacted: { label: "Com contacto", color: "hsl(142, 71%, 45%)" },
  noContact: { label: "Sem contacto", color: "hsl(var(--muted-foreground))" },
};

function getSlaLevel(orderDate: string | null) {
  if (!orderDate) return "normal";
  const days = differenceInDays(new Date(), parseISO(orderDate));
  if (days > 30) return "critical";
  if (days >= 20) return "alert";
  if (days >= 15) return "attention";
  return "normal";
}

export default function DelayedOrdersCharts({ orders, contacts }: DelayedOrdersChartsProps) {
  const slaDistribution = useMemo(() => {
    const counts = { normal: 0, attention: 0, alert: 0, critical: 0 };
    orders.forEach((o) => {
      const level = getSlaLevel(o.order_date);
      counts[level]++;
    });
    return [
      { name: "Normal (<15d)", value: counts.normal, fill: PIE_COLORS[0] },
      { name: "Atenção (15-20d)", value: counts.attention, fill: PIE_COLORS[1] },
      { name: "Alerta (20-30d)", value: counts.alert, fill: PIE_COLORS[2] },
      { name: "Vencidas (>30d)", value: counts.critical, fill: PIE_COLORS[3] },
    ].filter((d) => d.value > 0);
  }, [orders]);

  const situacaoData = useMemo(() => {
    const map: Record<string, number> = {};
    orders.forEach((o) => {
      const sit = o.situacao || "Sem situação";
      map[sit] = (map[sit] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const agingData = useMemo(() => {
    const buckets = [
      { label: "0-7d", min: 0, max: 7, count: 0 },
      { label: "8-14d", min: 8, max: 14, count: 0 },
      { label: "15-20d", min: 15, max: 20, count: 0 },
      { label: "21-30d", min: 21, max: 30, count: 0 },
      { label: "31-45d", min: 31, max: 45, count: 0 },
      { label: "46-60d", min: 46, max: 60, count: 0 },
      { label: ">60d", min: 61, max: 9999, count: 0 },
    ];
    orders.forEach((o) => {
      if (!o.order_date) return;
      const days = differenceInDays(new Date(), parseISO(o.order_date));
      const bucket = buckets.find((b) => days >= b.min && days <= b.max);
      if (bucket) bucket.count++;
    });
    return buckets.map((b) => ({
      name: b.label,
      count: b.count,
      fill:
        b.min >= 31
          ? "hsl(var(--destructive))"
          : b.min >= 21
          ? "hsl(25, 95%, 53%)"
          : b.min >= 15
          ? "hsl(45, 93%, 47%)"
          : "hsl(var(--primary))",
    }));
  }, [orders]);

  const contactRatio = useMemo(() => {
    const contacted = orders.filter((o) => (contacts[o.id] || []).length > 0).length;
    const noContact = orders.length - contacted;
    return [
      { name: "Com contacto", value: contacted, fill: "hsl(142, 71%, 45%)" },
      { name: "Sem contacto", value: noContact, fill: "hsl(var(--muted-foreground))" },
    ].filter((d) => d.value > 0);
  }, [orders, contacts]);

  if (orders.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* SLA Distribution Pie */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Distribuição SLA</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <ChartContainer config={barChartConfig} className="h-[200px] w-full aspect-auto">
            <PieChart>
              <Pie
                data={slaDistribution}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                strokeWidth={2}
                stroke="hsl(var(--background))"
              >
                {slaDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {slaDistribution.map((d) => (
              <div key={d.name} className="flex items-center gap-1 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                <span className="text-muted-foreground">{d.name}: <strong>{d.value}</strong></span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Aging Histogram */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Tempo de Espera (dias)</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <ChartContainer config={barChartConfig} className="h-[200px] w-full aspect-auto">
            <BarChart data={agingData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {agingData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Situação Bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Por Situação</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <ChartContainer config={situacaoChartConfig} className="h-[200px] w-full aspect-auto">
            <BarChart data={situacaoData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Contact Ratio Pie */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Taxa de Contacto</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <ChartContainer config={contactChartConfig} className="h-[200px] w-full aspect-auto">
            <PieChart>
              <Pie
                data={contactRatio}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                strokeWidth={2}
                stroke="hsl(var(--background))"
              >
                {contactRatio.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {contactRatio.map((d) => (
              <div key={d.name} className="flex items-center gap-1 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                <span className="text-muted-foreground">{d.name}: <strong>{d.value}</strong></span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
