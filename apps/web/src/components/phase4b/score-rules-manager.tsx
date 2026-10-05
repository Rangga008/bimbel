"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Phase1aFormDialog, type Phase1aField } from "@/components/phase1a/phase1a-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface ScoreRule {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  entityValue: string | null;
  pointsPerUnit: number;
  bonusThreshold: number | null;
  bonusPoints: number | null;
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
}

const RULE_FIELDS: Phase1aField[] = [
  { name: "name", label: "Nama rule", required: true },
  { name: "description", label: "Deskripsi (opsional)" },
  { name: "entityValue", label: "Nilai entity (opsional — ID exam/paket, atau tipe soal)" },
  { name: "pointsPerUnit", label: "Poin per unit (per skor / per jawaban benar)", type: "number", min: 0 },
  { name: "bonusThreshold", label: "Threshold bonus % (opsional)", type: "number", min: 0 },
  { name: "bonusPoints", label: "Poin bonus (opsional)", type: "number", min: 0 },
];

const ENTITY_TYPES = [
  { value: "EXAM", label: "EXAM — per ujian" },
  { value: "LATSOL", label: "LATSOL — per paket latihan" },
  { value: "QUESTION_TYPE", label: "QUESTION_TYPE — per tipe soal" },
];

const QUESTION_TYPES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"];

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("id-ID") : "-";
}

/** CRUD score_rules — data-driven, perubahan hanya berlaku untuk event berikutnya. */
export function ScoreRulesManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScoreRule | null>(null);
  const [ruleToRemove, setRuleToRemove] = useState<ScoreRule | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const rulesQ = useQuery({
    queryKey: ["score-rules"],
    queryFn: () => apiFetch<ScoreRule[]>("/score-rules"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["score-rules"] });

  const saveM = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        description: form.description || undefined,
        entityType: form.entityType || "EXAM",
        entityValue: form.entityValue || undefined,
        pointsPerUnit: form.pointsPerUnit === "" ? undefined : Number(form.pointsPerUnit),
        bonusThreshold: form.bonusThreshold === "" ? undefined : Number(form.bonusThreshold),
        bonusPoints: form.bonusPoints === "" ? undefined : Number(form.bonusPoints),
        validFrom: form.validFrom || undefined,
        validTo: form.validTo || undefined,
      };
      return editing
        ? apiFetch(`/score-rules/${editing.id}`, { method: "PUT", body })
        : apiFetch("/score-rules", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(editing ? "Rule diperbarui (berlaku untuk exam berikutnya)." : "Rule dibuat.");
      setDialogOpen(false);
      setEditing(null);
      setForm({});
      refresh();
    },
    onError: (e) => toast.error(err(e, "Gagal menyimpan rule.")),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => apiFetch(`/score-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setRuleToRemove(null);
      toast.success("Rule dinonaktifkan.");
      refresh();
    },
    onError: (e) => toast.error(err(e, "Gagal menonaktifkan rule.")),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ entityType: "EXAM", pointsPerUnit: "1" });
    setDialogOpen(true);
  };

  const openEdit = (rule: ScoreRule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      description: rule.description ?? "",
      entityType: rule.entityType,
      entityValue: rule.entityValue ?? "",
      pointsPerUnit: String(rule.pointsPerUnit),
      bonusThreshold: rule.bonusThreshold != null ? String(rule.bonusThreshold) : "",
      bonusPoints: rule.bonusPoints != null ? String(rule.bonusPoints) : "",
      validTo: rule.validTo ? rule.validTo.slice(0, 16) : "",
    });
    setDialogOpen(true);
  };

  const entityType = form.entityType || "EXAM";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Score Rules</CardTitle>
          <CardDescription>
            Aturan poin data-driven. Perubahan rule hanya berlaku untuk exam/latsol
            berikutnya — transaksi poin lama tidak berubah (tidak retroaktif).
          </CardDescription>
        </div>
        <Button onClick={openCreate}>Tambah Rule</Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rulesQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {rulesQ.isError ? (
          <p className="text-sm text-destructive">{err(rulesQ.error, "Gagal memuat score rules.")}</p>
        ) : null}
        {rulesQ.data?.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Belum ada rule.</p>
        ) : null}
        {rulesQ.data?.map((rule) => (
          <div key={rule.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{rule.name}</span>
                <Badge variant="outline">{rule.entityType}</Badge>
                {rule.entityValue ? <Badge variant="secondary">{rule.entityValue}</Badge> : null}
                {!rule.isActive ? <Badge variant="destructive">Nonaktif</Badge> : null}
              </div>
              <span className="text-xs text-muted-foreground">
                {rule.pointsPerUnit} poin/unit
                {rule.bonusThreshold != null && rule.bonusPoints != null
                  ? ` · bonus +${rule.bonusPoints} bila ≥ ${rule.bonusThreshold}%`
                  : ""}
                {" · berlaku "}
                {fmtDate(rule.validFrom)} – {rule.validTo ? fmtDate(rule.validTo) : "seterusnya"}
              </span>
              {rule.description ? (
                <span className="text-xs text-muted-foreground">{rule.description}</span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(rule)}>
                Edit
              </Button>
              {rule.isActive ? (
                <Button variant="outline" size="sm" onClick={() => setRuleToRemove(rule)}>
                  Nonaktifkan
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>

      <Phase1aFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Score Rule" : "Tambah Score Rule"}
        description="Rule bersifat data-driven. Mengubah rule tidak mengubah transaksi poin yang sudah tercatat."
        fields={RULE_FIELDS}
        values={form}
        onChange={(name, value) => setForm((f) => ({ ...f, [name]: value }))}
        onSubmit={() => saveM.mutate()}
        isSubmitting={saveM.isPending}
        extra={
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-entity-type">Entity type</Label>
              <select
                id="rule-entity-type"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={entityType}
                onChange={(e) => setForm((f) => ({ ...f, entityType: e.target.value, entityValue: "" }))}
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {entityType === "QUESTION_TYPE" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rule-entity-value">Tipe soal</Label>
                <select
                  id="rule-entity-value"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.entityValue ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, entityValue: e.target.value }))}
                >
                  <option value="">Semua tipe soal</option>
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {editing ? null : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rule-valid-from">Berlaku dari (opsional)</Label>
                <input
                  id="rule-valid-from"
                  type="datetime-local"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.validFrom ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
            )}
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rule-valid-to">Berlaku sampai (opsional)</Label>
                <input
                  id="rule-valid-to"
                  type="datetime-local"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.validTo ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
                />
              </div>
            ) : null}
          </div>
        }
      />
      <ConfirmDialog
        open={ruleToRemove !== null}
        onOpenChange={(o) => {
          if (!o) setRuleToRemove(null);
        }}
        title="Nonaktifkan score rule?"
        description={`Rule "${ruleToRemove?.name ?? ''}" tidak akan memberi poin lagi. Transaksi poin yang sudah tercatat tidak berubah.`}
        confirmLabel="Ya, nonaktifkan"
        pending={removeM.isPending}
        onConfirm={() => ruleToRemove && removeM.mutate(ruleToRemove.id)}
      />
    </Card>
  );
}
