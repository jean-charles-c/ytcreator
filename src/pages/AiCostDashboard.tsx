import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, BarChart3, Image as ImageIcon, Video, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ProjectCost {
  id: string;
  title: string;
  imageCost: number;
  imageCount: number;
  videoCost: number;
  videoCount: number;
  totalCost: number;
}

interface DailyCost {
  date: string;
  imageCost: number;
  videoCost: number;
  imageCount: number;
  videoCount: number;
}

const formatUsd = (v: number) => `${v.toFixed(2)} $`;

export default function AiCostDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projectCosts, setProjectCosts] = useState<ProjectCost[]>([]);
  const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([]);
  const [selectedProject] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Coûts IA — YouTube Creator Toolkit";
  }, []);

  useEffect(() => {
    if (!user) return;
    loadCosts();
  }, [user]);

  const loadCosts = async () => {
    setLoading(true);
    try {
      const [{ data: projects }, { data: shots }, { data: videoGens }] = await Promise.all([
        supabase.from("projects").select("id, title").order("updated_at", { ascending: false }),
        supabase.from("shots").select("project_id, generation_cost, updated_at"),
        supabase.from("video_generations").select("project_id, estimated_cost_usd, created_at, status"),
      ]);

      const projectMap = new Map<string, ProjectCost>();
      (projects ?? []).forEach((p) => {
        projectMap.set(p.id, {
          id: p.id,
          title: p.title,
          imageCost: 0,
          imageCount: 0,
          videoCost: 0,
          videoCount: 0,
          totalCost: 0,
        });
      });

      const dailyMap = new Map<string, DailyCost>();

      (shots ?? []).forEach((s) => {
        const cost = typeof s.generation_cost === "number" ? s.generation_cost : Number(s.generation_cost ?? 0);
        if (cost <= 0) return;
        const proj = projectMap.get(s.project_id);
        if (proj) {
          proj.imageCost += cost;
          proj.imageCount += 1;
        }
        const day = (s.updated_at ?? "").slice(0, 10);
        if (day) {
          const d = dailyMap.get(day) ?? { date: day, imageCost: 0, videoCost: 0, imageCount: 0, videoCount: 0 };
          d.imageCost += cost;
          d.imageCount += 1;
          dailyMap.set(day, d);
        }
      });

      (videoGens ?? []).forEach((v: any) => {
        const cost = typeof v.estimated_cost_usd === "number" ? v.estimated_cost_usd : Number(v.estimated_cost_usd ?? 0);
        const proj = projectMap.get(v.project_id);
        if (proj) {
          proj.videoCost += cost;
          proj.videoCount += 1;
        }
        const day = (v.created_at ?? "").slice(0, 10);
        if (day) {
          const d = dailyMap.get(day) ?? { date: day, imageCost: 0, videoCost: 0, imageCount: 0, videoCount: 0 };
          d.videoCost += cost;
          d.videoCount += 1;
          dailyMap.set(day, d);
        }
      });

      projectMap.forEach((p) => { p.totalCost = p.imageCost + p.videoCost; });

      const sorted = Array.from(projectMap.values())
        .filter((p) => p.totalCost > 0)
        .sort((a, b) => b.totalCost - a.totalCost);

      const dailySorted = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

      setProjectCosts(sorted);
      setDailyCosts(dailySorted);
    } finally {
      setLoading(false);
    }
  };

  const totalImages = projectCosts.reduce((s, p) => s + p.imageCost, 0);
  const totalVideos = projectCosts.reduce((s, p) => s + p.videoCost, 0);
  const totalAll = totalImages + totalVideos;
  const totalImageCount = projectCosts.reduce((s, p) => s + p.imageCount, 0);
  const totalVideoCount = projectCosts.reduce((s, p) => s + p.videoCount, 0);

  const filteredDaily = selectedProject
    ? [] // per-project daily not available without re-querying
    : dailyCosts;

  const maxDailyCost = filteredDaily.reduce((m, d) => Math.max(m, d.imageCost + d.videoCost), 0.01);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <BarChart3 className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold">Tableau de bord — Coûts IA</h1>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto p-4 space-y-6">
          {/* Global summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Total IA" value={formatUsd(totalAll)} accent />
            <SummaryCard icon={<ImageIcon className="h-4 w-4" />} label="Images" value={`${formatUsd(totalImages)} (${totalImageCount})`} />
            <SummaryCard icon={<Video className="h-4 w-4" />} label="Vidéos" value={`${formatUsd(totalVideos)} (${totalVideoCount})`} />
            <SummaryCard icon={<BarChart3 className="h-4 w-4" />} label="Projets" value={`${projectCosts.length}`} />
          </div>

          {/* Daily chart */}
          {filteredDaily.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Consommation par jour</h2>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredDaily.slice(0, 30).map((d) => {
                  const total = d.imageCost + d.videoCost;
                  const pct = (total / maxDailyCost) * 100;
                  return (
                    <div key={d.date} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-muted-foreground shrink-0">{d.date}</span>
                      <div className="flex-1 h-5 bg-secondary rounded overflow-hidden flex">
                        {d.imageCost > 0 && (
                          <div
                            className="h-full bg-primary/70"
                            style={{ width: `${(d.imageCost / maxDailyCost) * 100}%` }}
                            title={`Images: ${formatUsd(d.imageCost)}`}
                          />
                        )}
                        {d.videoCost > 0 && (
                          <div
                            className="h-full bg-green-500/70"
                            style={{ width: `${(d.videoCost / maxDailyCost) * 100}%` }}
                            title={`Vidéos: ${formatUsd(d.videoCost)}`}
                          />
                        )}
                      </div>
                      <span className="w-16 text-right font-medium">{formatUsd(total)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-primary/70 rounded" /> Images</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500/70 rounded" /> Vidéos</span>
              </div>
            </div>
          )}

          {/* Per-project table */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">Détail par projet</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-2 font-medium">Projet</th>
                    <th className="text-right px-3 py-2 font-medium">Images</th>
                    <th className="text-right px-3 py-2 font-medium">Coût img</th>
                    <th className="text-right px-3 py-2 font-medium">Vidéos</th>
                    <th className="text-right px-3 py-2 font-medium">Coût vid</th>
                    <th className="text-right px-4 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {projectCosts.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/editor/${p.id}`)}
                    >
                      <td className="px-4 py-2 font-medium truncate max-w-[200px]">{p.title}</td>
                      <td className="text-right px-3 py-2 text-muted-foreground">{p.imageCount}</td>
                      <td className="text-right px-3 py-2">{formatUsd(p.imageCost)}</td>
                      <td className="text-right px-3 py-2 text-muted-foreground">{p.videoCount}</td>
                      <td className="text-right px-3 py-2">{formatUsd(p.videoCost)}</td>
                      <td className="text-right px-4 py-2 font-semibold text-primary">{formatUsd(p.totalCost)}</td>
                    </tr>
                  ))}
                  <tr className="bg-secondary/50 font-semibold">
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="text-right px-3 py-2">{totalImageCount}</td>
                    <td className="text-right px-3 py-2">{formatUsd(totalImages)}</td>
                    <td className="text-right px-3 py-2">{totalVideoCount}</td>
                    <td className="text-right px-3 py-2">{formatUsd(totalVideos)}</td>
                    <td className="text-right px-4 py-2 text-primary">{formatUsd(totalAll)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-sm font-bold ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
