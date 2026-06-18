import copy from "copy-to-clipboard";
import { BookmarkIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "react-hot-toast";
import { useDialog } from "@/hooks/useDialog";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import CreateAccessTokenDialog from "../CreateAccessTokenDialog";
import SettingGroup from "./SettingGroup";
import SettingSection from "./SettingSection";

/** Build the bookmarklet href with embedded instance URL, token, and visibility */
function buildBookmarkletCode(instanceUrl: string, token: string, visibility: string): string {
  const base = instanceUrl.replace(/\/+$/, "");
  const clipperUrl = `${base}/clipper/clipper.js?token=${encodeURIComponent(token)}&url=${encodeURIComponent(base)}&visibility=${encodeURIComponent(visibility)}`;
  return `javascript:void(function(){var s=document.createElement('script');s.src='${clipperUrl}';document.body.appendChild(s)}())`;
}

const VisApiString: Record<number, string> = { 1: "PRIVATE", 2: "PROTECTED", 3: "PUBLIC" };

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: Visibility.PRIVATE, label: "Private" },
  { value: Visibility.PROTECTED, label: "Protected" },
  { value: Visibility.PUBLIC, label: "Public" },
];

const WebClipperSection = () => {
  const t = useTranslate();
  const createTokenDialog = useDialog();

  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(Visibility.PRIVATE);

  const instanceUrl = typeof window !== "undefined" ? window.location.origin : "";

  const bookmarkletCode = useMemo(
    () => (tokenInput.trim() ? buildBookmarkletCode(instanceUrl, tokenInput.trim(), VisApiString[visibility] ?? "PRIVATE") : ""),
    [instanceUrl, tokenInput, visibility],
  );

  const handleCopyCode = useCallback(() => {
    if (!bookmarkletCode) return;
    copy(bookmarkletCode);
    toast.success("Code copied to clipboard");
  }, [bookmarkletCode]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/uri-list", bookmarkletCode);
      e.dataTransfer.setData("text/plain", bookmarkletCode);
    },
    [bookmarkletCode],
  );

  const handleCreateTokenSuccess = useCallback(
    (response: { token?: string }) => {
      if (response.token) {
        setTokenInput(response.token);
        copy(response.token);
        toast.success("Token created and pasted. Ready to generate bookmarklet!");
      }
    },
    [],
  );

  return (
    <SettingSection
      title={t("setting.clipper.title")}
      description={t("setting.clipper.description")}
    >
      {/* Token input */}
      <SettingGroup
        title="Access Token"
        description="Paste your Personal Access Token below, or create a new one."
        actions={
          <Button onClick={createTokenDialog.open} size="sm">
            <PlusIcon className="w-4 h-4 mr-1" />
            Create Token
          </Button>
        }
      >
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="memos_pat_..."
              className="font-mono text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </SettingGroup>

      <Separator />

      {/* Visibility */}
      <SettingGroup title="Default Visibility" description="Default visibility for clipped pages.">
        <Select value={visibility.toString()} onValueChange={(v) => setVisibility(Number(v) as Visibility)}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value.toString()}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingGroup>

      <Separator />

      {/* Bookmarklet */}
      {bookmarkletCode && (
        <>
          <SettingGroup
            title={t("setting.clipper.bookmarklet")}
            description="Drag this link to your browser bookmarks bar:"
          >
            <a
              href={bookmarkletCode}
              draggable
              onDragStart={handleDragStart}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors font-medium text-sm w-fit cursor-grab active:cursor-grabbing"
            >
              <BookmarkIcon className="w-4 h-4" />
              📎 Save to Memos
            </a>
            <p className="text-xs text-muted-foreground mt-1">Drag to bookmarks bar, then click on any page to clip.</p>
          </SettingGroup>

          {/* Manual setup */}
          <SettingGroup title={t("setting.clipper.manual")} description="Or copy this code and create a bookmark manually:">
            <div className="flex gap-2">
              <Input
                value={bookmarkletCode}
                readOnly
                className="font-mono text-xs flex-1"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button variant="outline" size="sm" onClick={handleCopyCode}>
                <CopyIcon className="w-4 h-4 mr-1" />
                {t("setting.clipper.copy-code")}
              </Button>
            </div>
          </SettingGroup>

          {/* Security notice */}
          <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
            <p className="font-medium mb-1">⚠️ Security Notice</p>
            <p>{t("setting.clipper.security-notice")}</p>
          </div>
        </>
      )}

      <CreateAccessTokenDialog
        open={createTokenDialog.isOpen}
        onOpenChange={createTokenDialog.setOpen}
        onSuccess={handleCreateTokenSuccess}
      />
    </SettingSection>
  );
};

export default WebClipperSection;
