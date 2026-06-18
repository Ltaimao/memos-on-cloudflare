import copy from "copy-to-clipboard";
import { BookmarkIcon, CopyIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { userServiceClient } from "@/connect";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useDialog } from "@/hooks/useDialog";
import { handleError } from "@/lib/error";
import { PersonalAccessToken, CreatePersonalAccessTokenResponse } from "@/types/proto/api/v1/user_service_pb";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import CreateAccessTokenDialog from "../CreateAccessTokenDialog";
import SettingGroup from "./SettingGroup";
import SettingSection from "./SettingSection";

const listAccessTokens = async (parent: string) => {
  const { personalAccessTokens } = await userServiceClient.listPersonalAccessTokens({ parent });
  return personalAccessTokens.sort(
    (a: { createdAt?: { seconds?: { toNumber?: () => number } } }, b: { createdAt?: { seconds?: { toNumber?: () => number } } }) =>
      ((b.createdAt?.seconds?.toNumber?.() ?? 0)) - ((a.createdAt?.seconds?.toNumber?.() ?? 0)),
  );
};

/** Build the bookmarklet href with embedded instance URL, token, and visibility */
function buildBookmarkletCode(instanceUrl: string, token: string, visibility: string): string {
  // Remove trailing slash
  const base = instanceUrl.replace(/\/+$/, "");
  const clipperUrl = `${base}/clipper/clipper.js?token=${encodeURIComponent(token)}&url=${encodeURIComponent(base)}&visibility=${encodeURIComponent(visibility)}`;
  return `javascript:void(function(){var s=document.createElement('script');s.src='${clipperUrl}';document.body.appendChild(s)}())`;
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: Visibility.PRIVATE, label: "Private" },
  { value: Visibility.PROTECTED, label: "Protected" },
  { value: Visibility.PUBLIC, label: "Public" },
];

const WebClipperSection = () => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const createTokenDialog = useDialog();

  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string>("");
  const [visibility, setVisibility] = useState<Visibility>(Visibility.PRIVATE);
  const [loading, setLoading] = useState(true);

  // Determine instance URL from window origin
  const instanceUrl = typeof window !== "undefined" ? window.location.origin : "";

  const refreshTokens = useCallback(async () => {
    if (!currentUser?.name) return;
    try {
      setLoading(true);
      const list = await listAccessTokens(currentUser.name);
      setTokens(list);
      if (list.length > 0 && !selectedTokenId) {
        setSelectedTokenId(list[0].name);
      }
    } catch (error) {
      handleError(error, toast.error, { context: "List access tokens" });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.name, selectedTokenId]);

  useEffect(() => {
    refreshTokens();
  }, [refreshTokens]);

  const selectedToken = useMemo(
    () => tokens.find((t) => t.name === selectedTokenId),
    [tokens, selectedTokenId],
  );

  const handleCreateTokenSuccess = useCallback(
    async (response: CreatePersonalAccessTokenResponse) => {
      await refreshTokens();
      if (response.token) {
        copy(response.token);
        toast.success("Token created and copied to clipboard");
      }
    },
    [refreshTokens],
  );

  const bookmarkletCode = useMemo(
    () => (selectedToken?.name ? buildBookmarkletCode(instanceUrl, selectedToken.name, visibility.toString()) : ""),
    [instanceUrl, selectedToken, visibility],
  );

  const handleCopyBookmarklet = useCallback(() => {
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

  return (
    <SettingSection
      title={t("setting.clipper.title")}
      description={t("setting.clipper.description")}
    >
      {/* Token Selection */}
      <SettingGroup
        title="Access Token"
        description="Select or create a personal access token for the clipper."
        actions={
          <Button onClick={createTokenDialog.open} size="sm">
            <PlusIcon className="w-4 h-4 mr-1" />
            Create Token
          </Button>
        }
      >
        {loading ? (
          <div className="text-sm text-muted-foreground py-2">Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No access tokens yet. Create one to use the Web Clipper.
          </div>
        ) : (
          <Select value={selectedTokenId} onValueChange={setSelectedTokenId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select an access token" />
            </SelectTrigger>
            <SelectContent>
              {tokens.map((token) => (
                <SelectItem key={token.name} value={token.name}>
                  {token.description || token.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
      )}

      {/* Manual setup */}
      {bookmarkletCode && (
        <SettingGroup title={t("setting.clipper.manual")} description="Or copy this code and create a bookmark manually:">
          <div className="flex gap-2">
            <Input
              value={bookmarkletCode}
              readOnly
              className="font-mono text-xs flex-1"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button variant="outline" size="sm" onClick={handleCopyBookmarklet}>
              <CopyIcon className="w-4 h-4 mr-1" />
              {t("setting.clipper.copy-code")}
            </Button>
          </div>
        </SettingGroup>
      )}

      {/* Security notice */}
      {bookmarkletCode && (
        <div className="mt-4 px-4 py-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
          <p className="font-medium mb-1">⚠️ Security Notice</p>
          <p>{t("setting.clipper.security-notice")}</p>
        </div>
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
