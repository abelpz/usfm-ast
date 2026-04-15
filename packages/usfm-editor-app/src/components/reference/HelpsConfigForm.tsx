import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_HELPS_CONFIG,
  type HelpsResourceConfig,
} from '@/lib/helps-config-storage';

type Props = {
  cfg: HelpsResourceConfig;
  onChange: (next: HelpsResourceConfig) => void;
};

/** Manual Door43 paths for TWL/TN/TW/TA (advanced override). */
export function HelpsConfigForm({ cfg, onChange }: Props) {
  const persist = onChange;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => persist({ ...cfg, enabled: e.target.checked })}
        />
        Enable verse-aligned helps (manual paths)
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Door43 host</Label>
          <Input
            value={cfg.host}
            onChange={(e) => persist({ ...cfg, host: e.target.value.trim() || DEFAULT_HELPS_CONFIG.host })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">TWL path template</Label>
          <Input value={cfg.twlPathTpl} onChange={(e) => persist({ ...cfg, twlPathTpl: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">TWL owner / repo / ref</Label>
          <div className="flex gap-1">
            <Input className="flex-1" value={cfg.twlOwner} onChange={(e) => persist({ ...cfg, twlOwner: e.target.value.trim() })} />
            <Input className="flex-1" value={cfg.twlRepo} onChange={(e) => persist({ ...cfg, twlRepo: e.target.value.trim() })} />
            <Input className="w-24" value={cfg.twlRef} onChange={(e) => persist({ ...cfg, twlRef: e.target.value.trim() })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">TN path template</Label>
          <Input value={cfg.tnPathTpl} onChange={(e) => persist({ ...cfg, tnPathTpl: e.target.value })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">TN owner / repo / ref</Label>
          <div className="flex gap-1">
            <Input className="flex-1" value={cfg.tnOwner} onChange={(e) => persist({ ...cfg, tnOwner: e.target.value.trim() })} />
            <Input className="flex-1" value={cfg.tnRepo} onChange={(e) => persist({ ...cfg, tnRepo: e.target.value.trim() })} />
            <Input className="w-24" value={cfg.tnRef} onChange={(e) => persist({ ...cfg, tnRef: e.target.value.trim() })} />
          </div>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">TW articles (owner / repo / ref)</Label>
          <div className="flex gap-1">
            <Input className="flex-1" value={cfg.twArticleOwner} onChange={(e) => persist({ ...cfg, twArticleOwner: e.target.value.trim() })} />
            <Input className="flex-1" value={cfg.twArticleRepo} onChange={(e) => persist({ ...cfg, twArticleRepo: e.target.value.trim() })} />
            <Input className="w-24" value={cfg.twArticleRef} onChange={(e) => persist({ ...cfg, twArticleRef: e.target.value.trim() })} />
          </div>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">TA articles (owner / repo / ref)</Label>
          <div className="flex gap-1">
            <Input className="flex-1" value={cfg.taArticleOwner} onChange={(e) => persist({ ...cfg, taArticleOwner: e.target.value.trim() })} />
            <Input className="flex-1" value={cfg.taArticleRepo} onChange={(e) => persist({ ...cfg, taArticleRepo: e.target.value.trim() })} />
            <Input className="w-24" value={cfg.taArticleRef} onChange={(e) => persist({ ...cfg, taArticleRef: e.target.value.trim() })} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => persist({ ...DEFAULT_HELPS_CONFIG })}>
          Reset defaults
        </Button>
      </div>
    </div>
  );
}
