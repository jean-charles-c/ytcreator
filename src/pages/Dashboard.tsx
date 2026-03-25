import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { Plus, Film, Clock, CheckCircle, FileText, ArrowLeft, LogOut, Trash2, Pencil, Check, X, FolderPlus, Folder, FolderOpen, GripVertical } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects">;
type ProjectWithShotCount = Project & { shot_count: number; group_id: string | null };

interface ProjectGroup {
  id: string;
  name: string;
  user_id: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

const statusConfig = {
  draft: { label: "Brouillon", icon: FileText, color: "text-muted-foreground" },
  segmented: { label: "Segmenté", icon: Clock, color: "text-primary" },
  storyboarded: { label: "VisualPrompts ✓", icon: CheckCircle, color: "text-primary" },
  exported: { label: "Exporté", icon: CheckCircle, color: "text-green-500" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithShotCount[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string> | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { document.title = "Dashboard — YouTube Creator Toolkit"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: projectsData }, { data: groupsData }] = await Promise.all([
        supabase.from("projects").select("*").order("updated_at", { ascending: false }),
        supabase.from("project_groups").select("*").order("display_order", { ascending: true }),
      ]);
      if (!projectsData) { setLoading(false); return; }
      const projectIds = projectsData.map((p) => p.id);
      const { data: shots } = await supabase.from("shots").select("project_id").in("project_id", projectIds);
      const shotCounts: Record<string, number> = {};
      (shots ?? []).forEach((s) => { shotCounts[s.project_id] = (shotCounts[s.project_id] || 0) + 1; });
      setProjects(projectsData.map((p) => ({ ...p, shot_count: shotCounts[p.id] || 0 })));
      const loadedGroups = groupsData ?? [];
      setGroups(loadedGroups);
      setCollapsedGroups(new Set(loadedGroups.map((g) => g.id)));
      setLoading(false);
    };
    fetchData();
  }, []);

  // --- Project rename ---
  const startRename = (e: React.MouseEvent, project: ProjectWithShotCount) => {
    e.stopPropagation();
    setEditingId(project.id);
    setEditTitle(project.title);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const confirmRename = async (e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!editingId || !editTitle.trim()) return;
    const { error } = await supabase.from("projects").update({ title: editTitle.trim() }).eq("id", editingId);
    if (error) { toast.error("Erreur de renommage"); return; }
    setProjects((prev) => prev.map((p) => p.id === editingId ? { ...p, title: editTitle.trim() } : p));
    setEditingId(null);
    toast.success("Projet renommé");
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm("Supprimer ce projet et toutes ses scènes/shots ?")) return;
    await supabase.from("shots").delete().eq("project_id", projectId);
    await supabase.from("scenes").delete().eq("project_id", projectId);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) { toast.error("Erreur de suppression"); return; }
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    toast.success("Projet supprimé");
  };

  // --- Group CRUD ---
  const createGroup = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("project_groups").insert({ user_id: user.id, name: "Nouveau groupe", display_order: groups.length }).select().single();
    if (error || !data) { toast.error("Erreur de création du groupe"); return; }
    setGroups((prev) => [...prev, data as ProjectGroup]);
    setEditingGroupId(data.id);
    setEditGroupName(data.name);
    setTimeout(() => groupInputRef.current?.focus(), 50);
  };

  const confirmGroupRename = async (e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!editingGroupId || !editGroupName.trim()) return;
    const { error } = await supabase.from("project_groups").update({ name: editGroupName.trim() }).eq("id", editingGroupId);
    if (error) { toast.error("Erreur de renommage"); return; }
    setGroups((prev) => prev.map((g) => g.id === editingGroupId ? { ...g, name: editGroupName.trim() } : g));
    setEditingGroupId(null);
    toast.success("Groupe renommé");
  };

  const deleteGroup = async (groupId: string) => {
    if (!confirm("Supprimer ce groupe ? Les projets seront déplacés hors du groupe.")) return;
    // Ungroup projects first
    await supabase.from("projects").update({ group_id: null }).eq("group_id", groupId);
    const { error } = await supabase.from("project_groups").delete().eq("id", groupId);
    if (error) { toast.error("Erreur de suppression"); return; }
    setProjects((prev) => prev.map((p) => p.group_id === groupId ? { ...p, group_id: null } : p));
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    toast.success("Groupe supprimé");
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  // --- Drag & Drop to assign group ---
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.setData("projectId", projectId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    setDragOverGroupId(null);
    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;
    const { error } = await supabase.from("projects").update({ group_id: groupId }).eq("id", projectId);
    if (error) { toast.error("Erreur de déplacement"); return; }
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, group_id: groupId } : p));
  };

  const handleDragOver = (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupId(groupId);
  };

  // --- Render project card ---
  const renderProjectCard = (project: ProjectWithShotCount, i: number) => {
    const s = statusConfig[project.status];
    return (
      <div
        key={project.id}
        draggable
        onDragStart={(e) => handleDragStart(e, project.id)}
        onClick={() => { if (editingId !== project.id) navigate(`/editor/${project.id}`); }}
        className="group rounded border border-border bg-card p-4 sm:p-5 text-left transition-colors hover:bg-accent/50 animate-fade-in min-h-[80px] cursor-pointer"
        style={{ animationDelay: `${i * 80}ms` }}
      >
        <div className="flex items-start justify-between mb-2 sm:mb-3">
          {editingId === project.id ? (
            <form onSubmit={confirmRename} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 flex-1 pr-2">
              <Input
                ref={editInputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="h-7 text-sm font-semibold bg-background"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") { setEditingId(null); }
                }}
              />
              <button type="submit" className="p-1 rounded text-primary hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={cancelRename} className="p-1 rounded text-muted-foreground hover:bg-secondary transition-colors"><X className="h-3.5 w-3.5" /></button>
            </form>
          ) : (
            <h3 className="font-display text-sm sm:text-base font-semibold text-foreground leading-snug pr-4">
              {project.title}
            </h3>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 cursor-grab" />
            <s.icon className={`h-4 w-4 mt-0.5 ${s.color}`} />
            <button
              onClick={(e) => startRename(e, project)}
              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Renommer le projet"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => deleteProject(e, project.id)}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Supprimer le projet"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
          <span className={s.color}>{s.label}</span>
          <span>·</span>
          <span>{project.scene_count} scène{project.scene_count > 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{project.shot_count} shot{project.shot_count > 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{timeAgo(project.updated_at)}</span>
        </div>
      </div>
    );
  };

  // --- Organize projects by group ---
  const ungroupedProjects = projects.filter((p) => !p.group_id);
  const groupedProjects = groups.map((g) => ({
    ...g,
    projects: projects.filter((p) => p.group_id === g.id),
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Film className="h-5 w-5 text-primary" />
            <span className="font-display text-base sm:text-lg font-semibold text-foreground">Mes projets</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={createGroup} className="min-h-[40px]" title="Créer un groupe">
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Nouveau groupe</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/login"); }} className="min-h-[40px] min-w-[40px]">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 sm:py-10 px-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Create project button at the top */}
            <button
              onClick={() => navigate("/editor/new")}
              className="rounded border border-dashed border-border bg-transparent px-5 py-3 text-center transition-colors hover:border-primary/50 hover:bg-accent/30 flex items-center gap-2 w-full sm:w-auto"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Créer un projet</span>
            </button>

            {/* Grouped projects */}
            {groupedProjects.map((group) => {
              const isCollapsed = collapsedGroups?.has(group.id) ?? true;
              const isEditing = editingGroupId === group.id;
              const isDragOver = dragOverGroupId === group.id;
              return (
                <div
                  key={group.id}
                  className={`rounded-lg border transition-colors ${isDragOver ? "border-primary bg-primary/5" : "border-border"}`}
                  onDrop={(e) => handleDrop(e, group.id)}
                  onDragOver={(e) => handleDragOver(e, group.id)}
                  onDragLeave={() => setDragOverGroupId(null)}
                >
                  <div className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none" onClick={() => !isEditing && toggleGroupCollapse(group.id)}>
                    {isCollapsed
                      ? <Folder className="h-4 w-4 text-primary shrink-0" />
                      : <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                    }
                    {isEditing ? (
                      <form onSubmit={confirmGroupRename} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 flex-1">
                        <Input
                          ref={groupInputRef}
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          className="h-7 text-sm font-semibold bg-background max-w-[240px]"
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Escape") setEditingGroupId(null);
                          }}
                        />
                        <button type="submit" className="p-1 rounded text-primary hover:bg-primary/10 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEditingGroupId(null); }} className="p-1 rounded text-muted-foreground hover:bg-secondary transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </form>
                    ) : (
                      <>
                        <span className="font-display text-sm font-semibold text-foreground flex-1">{group.name}</span>
                        <span className="text-xs text-muted-foreground mr-2">{group.projects.length} projet{group.projects.length > 1 ? "s" : ""}</span>
                        <button onClick={(e) => { e.stopPropagation(); setEditingGroupId(group.id); setEditGroupName(group.name); setTimeout(() => groupInputRef.current?.focus(), 50); }} className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100 hover:opacity-100" title="Renommer">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 hover:opacity-100" title="Supprimer le groupe">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 px-4 pb-4">
                      {group.projects.map((p, i) => renderProjectCard(p, i))}
                      {group.projects.length === 0 && (
                        <p className="text-xs text-muted-foreground italic py-2 col-span-full">Glissez un projet ici pour l'ajouter au groupe</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ungrouped projects */}
            <div
              className={`transition-colors rounded-lg ${dragOverGroupId === "__ungrouped" ? "border border-primary bg-primary/5 p-4" : ""}`}
              onDrop={(e) => handleDrop(e, null)}
              onDragOver={(e) => handleDragOver(e, "__ungrouped")}
              onDragLeave={() => setDragOverGroupId(null)}
            >
              {groups.length > 0 && ungroupedProjects.length > 0 && (
                <p className="text-xs text-muted-foreground mb-3 font-medium">Sans groupe</p>
              )}
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ungroupedProjects.map((p, i) => renderProjectCard(p, i))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
