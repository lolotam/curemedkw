import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, CheckCheck, Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  useProfile,
  useUpdateProfile,
  useMyOrders,
  useMyNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/lib/db";
import { KW_AREAS } from "@/lib/kuwaitData";
import { cn } from "@/lib/utils";

export default function Account() {
  const { t, lang } = useI18n();
  const { user, loading, signOut } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: orders = [] } = useMyOrders(user?.id);
  const { data: notifications = [] } = useMyNotifications(user?.id);
  const updateProfile = useUpdateProfile();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [newPw, setNewPw] = useState("");

  const [form, setForm] = useState({
    fullName: "", phone: "", city: "Kuwait", area: "",
    block: "", street: "", building: "", addressLine: "", notes: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName,
        phone: profile.phone,
        city: profile.city || "Kuwait",
        area: profile.area,
        block: profile.block,
        street: profile.street,
        building: profile.building,
        addressLine: profile.addressLine,
        notes: profile.notes,
      });
    }
  }, [profile]);

  if (loading) {
    return (
      <SiteLayout>
        <div className="container py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      </SiteLayout>
    );
  }
  if (!user) return <Navigate to="/auth?next=/account" replace />;

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onUploadAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await updateProfile.mutateAsync({ id: user.id, patch: { avatarUrl: data.publicUrl } });
      toast.success("Photo updated");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await updateProfile.mutateAsync({ id: user.id, patch: form });
      toast.success("Profile saved");
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 6) return toast.error("Password must be at least 6 characters");
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setNewPw("");
      toast.success("Password updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed");
    } finally {
      setPwBusy(false);
    }
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <SiteLayout>
      <section className="container py-10 md:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover bg-muted" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-brand/10 text-brand inline-flex items-center justify-center font-bold text-xl">
                {(profile?.fullName || user.email || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{profile?.fullName || user.email}</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}>{t("nav.signout")}</Button>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="profile">{t("account.tabs.profile")}</TabsTrigger>
            <TabsTrigger value="orders">{t("account.tabs.orders")} {orders.length > 0 && <span className="ml-1 text-xs">({orders.length})</span>}</TabsTrigger>
            <TabsTrigger value="notifications">{t("account.tabs.notifications")} {unread > 0 && <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px]">{unread}</span>}</TabsTrigger>
            <TabsTrigger value="security">{t("account.tabs.security")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <Card className="p-6">
              <form onSubmit={saveProfile} className="space-y-6">
                <div className="flex items-center gap-4">
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
                    const f = e.target.files?.[0]; if (f) void onUploadAvatar(f);
                  }} />
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {t("account.uploadAvatar")}
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>{t("auth.fullName")}</Label><Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} /></div>
                  <div><Label>{t("auth.phone")}</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label>{t("checkout.city")}</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
                  <div>
                    <Label>{t("checkout.area")}</Label>
                    <select value={form.area} onChange={(e) => set("area", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">{t("checkout.areaSelect")}</option>
                      {KW_AREAS.map((a) => <option key={a.en} value={a.en}>{lang === "ar" ? a.ar : a.en}</option>)}
                    </select>
                  </div>
                  <div><Label>{t("checkout.block")}</Label><Input value={form.block} onChange={(e) => set("block", e.target.value)} /></div>
                  <div><Label>{t("checkout.street")}</Label><Input value={form.street} onChange={(e) => set("street", e.target.value)} /></div>
                  <div><Label>{t("checkout.building")}</Label><Input value={form.building} onChange={(e) => set("building", e.target.value)} /></div>
                  <div className="sm:col-span-2"><Label>{t("checkout.addressLine")}</Label><Input value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} /></div>
                  <div className="sm:col-span-2"><Label>{t("checkout.notes")}</Label><Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
                </div>
                <Button type="submit" disabled={updateProfile.isPending} className="bg-brand hover:bg-brand/90 text-white">
                  {updateProfile.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("account.save")}
                </Button>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-6">
            <Card className="p-6">
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("account.noOrders")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {orders.map((o) => (
                    <li key={o.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">#{o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <OrderStatusBadge status={o.orderStatus} />
                        <span className="font-bold">KD {o.total.toFixed(2)}</span>
                        <Button asChild size="sm" variant="outline"><Link to={`/order-confirmation/${o.id}`}>View</Link></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2"><Bell className="h-4 w-4" /> {t("account.tabs.notifications")}</h3>
                {unread > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => markAllRead.mutate(user.id)}>
                    <CheckCheck className="h-4 w-4 mr-1" />{t("account.markAllRead")}
                  </Button>
                )}
              </div>
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("account.noNotifications")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      onClick={() => !n.isRead && markRead.mutate({ id: n.id, userId: user.id })}
                      className={cn("py-3 cursor-pointer hover:bg-muted/30 px-2 rounded", !n.isRead && "bg-brand/5")}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-destructive shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{n.title}</p>
                          {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                          {n.link && <Link to={n.link} className="text-xs text-brand hover:underline mt-1 inline-block">View →</Link>}
                          <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-6">
            <Card className="p-6 max-w-md">
              <h3 className="font-semibold mb-4">{t("account.changePassword")}</h3>
              <form onSubmit={changePassword} className="space-y-3">
                <div>
                  <Label>{t("auth.newPassword")}</Label>
                  <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" disabled={pwBusy} className="bg-brand hover:bg-brand/90 text-white">
                  {pwBusy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("auth.updatePassword")}
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </SiteLayout>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    new: "bg-blue-500/10 text-blue-600",
    confirmed: "bg-cyan-500/10 text-cyan-600",
    processing: "bg-amber-500/10 text-amber-600",
    shipped: "bg-purple-500/10 text-purple-600",
    delivered: "bg-emerald-500/10 text-emerald-600",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return <Badge className={cn("uppercase text-[10px]", variants[status] || "bg-muted")}>{status}</Badge>;
}