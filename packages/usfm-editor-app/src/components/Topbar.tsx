import { SyncStatusPill } from '@/components/SyncStatusPill';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Door43UserInfo } from '@/dcs-client';
import type { SyncStatusState } from '@/hooks/useSyncStatus';
import type { EditorMode } from '@usfm-tools/editor';
import {
  BookOpen,
  Download,
  FileUp,
  Globe,
  HelpCircle,
  Layers,
  LogIn,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  SunMoon,
  Users,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

export type TopbarProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Signed-in Door43 user (optional avatar). */
  door43User?: Door43UserInfo | null;
  /** Open lightweight sign-in when not using DCS menu. */
  onSignInClick?: () => void;
  onDcs: () => void;
  onCollaborate: () => void;
  syncState: SyncStatusState;
  syncPeerCount?: number;
  syncDetail?: string;
  /** True when DCS sync or collaboration is active — hides the pill otherwise. */
  syncConnected: boolean;
  /** Open export USFM dialog (alignment layer picker). */
  onOpenExportUsfm: () => void;
  onExportUsx: () => void;
  referencePanel: boolean;
  onToggleReference: () => void;
  usfmSource: boolean;
  onToggleUsfmSource: () => void;
  onSyncNow: () => void;
  usfmTheme: 'document' | 'document-dark';
  onUsfmTheme: (t: 'document' | 'document-dark') => void;
  editorMode: EditorMode;
  onEditorMode: (m: EditorMode) => void;
  markerPaletteValue: string;
  onMarkerPaletteValue: (v: string) => void;
  markerPaletteOptions: ReadonlyArray<{ value: string; label: string }>;
  onAlignment: () => void;
  onHelp: () => void;
  /** Optional center slot — typically the SectionPicker rendered inline. */
  navigationSlot?: ReactNode;
};

export function Topbar({
  fileInputRef,
  onFileInputChange,
  door43User,
  onSignInClick,
  onDcs,
  onCollaborate,
  syncState,
  syncPeerCount,
  syncDetail,
  syncConnected,
  onOpenExportUsfm,
  onExportUsx,
  referencePanel,
  onToggleReference,
  usfmSource,
  onToggleUsfmSource,
  onSyncNow,
  usfmTheme,
  onUsfmTheme,
  editorMode,
  onEditorMode,
  markerPaletteValue,
  onMarkerPaletteValue,
  markerPaletteOptions,
  onAlignment,
  onHelp,
  navigationSlot,
}: TopbarProps) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex items-center gap-2 border-b border-border px-3 py-1.5 backdrop-blur">
      <BookOpen className="text-primary size-5 shrink-0" aria-label="Scripture Editor" />

      {navigationSlot ? (
        <div className="min-w-0 flex-1 overflow-hidden">{navigationSlot}</div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-2">
        {door43User ? (
          <Button type="button" variant="ghost" size="icon" className="size-8 rounded-full p-0" onClick={onDcs} title="Door43">
            {door43User.avatarUrl ? (
              <img src={door43User.avatarUrl} alt="" className="size-8 rounded-full" />
            ) : (
              <Globe className="text-primary size-4" />
            )}
          </Button>
        ) : onSignInClick ? (
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onSignInClick} title="Sign in">
            <LogIn className="size-4" />
          </Button>
        ) : null}

        <SyncStatusPill
          state={syncState}
          peerCount={syncPeerCount}
          detail={syncDetail}
          connected={syncConnected}
        />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".usfm,.usj,.usx,.txt,.sfm,.xml,.json,.alignment.json,text/plain,*/*"
          onClick={() => {
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          onChange={onFileInputChange}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Menu">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem className="gap-2" onSelect={onDcs}>
              <Globe className="size-4" />
              Door43 / DCS
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={onCollaborate}>
              <Users className="size-4" />
              Collaborate
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={() => fileInputRef.current?.click()}>
              <FileUp className="size-4" />
              Open file…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuItem className="gap-2" onSelect={onOpenExportUsfm}>
              <Download className="size-4" />
              Export USFM…
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={onExportUsx}>
              <Download className="size-4" />
              Export USX
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Panels</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={referencePanel} onCheckedChange={() => onToggleReference()}>
              Reference panel
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={usfmSource} onCheckedChange={() => onToggleUsfmSource()}>
              USFM source
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={onSyncNow}>
              <RefreshCw className="size-4" />
              Sync now
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={onAlignment}>
              <Layers className="size-4" />
              Word alignment
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <SunMoon className="size-4" />
                Appearance
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={usfmTheme} onValueChange={(v) => onUsfmTheme(v as 'document' | 'document-dark')}>
                  <DropdownMenuRadioItem value="document">Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="document-dark">Dark</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Marker palette</DropdownMenuLabel>
                <select
                  className="border-input bg-background mx-2 mb-2 w-[calc(100%-1rem)] rounded-md border px-2 py-1 text-xs"
                  value={markerPaletteValue}
                  onChange={(e) => onMarkerPaletteValue(e.target.value)}
                >
                  {markerPaletteOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Sparkles className="size-4" />
                Editing
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuLabel className="text-xs">Marker mode</DropdownMenuLabel>
                <select
                  className="border-input bg-background mx-2 mb-2 w-[calc(100%-1rem)] rounded-md border px-2 py-1 text-xs"
                  value={editorMode}
                  onChange={(e) => onEditorMode(e.target.value as EditorMode)}
                >
                  <option value="basic">Basic (draft)</option>
                  <option value="medium">Medium</option>
                  <option value="advanced">Advanced</option>
                </select>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={onHelp}>
              <HelpCircle className="size-4" />
              Help &amp; shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
