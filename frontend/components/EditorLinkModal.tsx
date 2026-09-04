'use client';

import { useEffect, useState } from 'react';
import { Link2, ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  initialUrl?: string;
  initialText?: string;
  initialNewTab?: boolean;
  initialNoFollow?: boolean;
  hasLink?: boolean;
  onClose: () => void;
  onSave: (params: { url: string; text?: string; newTab: boolean; noFollow: boolean }) => void;
  onRemove?: () => void;
}

export function EditorLinkModal({
  open,
  initialUrl = '',
  initialText = '',
  initialNewTab = true,
  initialNoFollow = false,
  hasLink = false,
  onClose,
  onSave,
  onRemove,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [newTab, setNewTab] = useState(initialNewTab);
  const [noFollow, setNoFollow] = useState(initialNoFollow);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setText(initialText);
      setNewTab(initialNewTab);
      setNoFollow(initialNoFollow);
    }
  }, [open, initialUrl, initialText, initialNewTab, initialNoFollow]);

  const handleSave = () => {
    let cleanUrl = url.trim();
    if (!cleanUrl) return;
    if (!/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }
    onSave({
      url: cleanUrl,
      text: text.trim() || undefined,
      newTab,
      noFollow,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden bg-background border-border">
        {/* Header */}
        <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/20">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            {hasLink ? 'Edit Hyperlink' : 'Insert Hyperlink'}
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="link-url-input" className="text-xs font-medium">
              Destination URL
            </Label>
            <Input
              id="link-url-input"
              placeholder="https://example.com or /posts/my-article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              autoFocus
              className="text-xs h-9 font-mono"
            />
          </div>

          {initialText !== undefined && (
            <div className="space-y-1.5">
              <Label htmlFor="link-text-input" className="text-xs font-medium">
                Link Text
              </Label>
              <Input
                id="link-text-input"
                placeholder="Display text for this link"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          )}

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="new-tab-toggle" className="text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  Open link in new tab
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Adds target=&quot;_blank&quot; rel=&quot;noopener noreferrer&quot;
                </p>
              </div>
              <Switch
                id="new-tab-toggle"
                checked={newTab}
                onCheckedChange={setNewTab}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="nofollow-toggle" className="text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                  <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                  Add nofollow attribute (SEO)
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Signals search engines not to pass SEO authority (affiliate / sponsored)
                </p>
              </div>
              <Switch
                id="nofollow-toggle"
                checked={noFollow}
                onCheckedChange={setNoFollow}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
          <div>
            {hasLink && onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-8 gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove Link
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!url.trim()}
              onClick={handleSave}
              className="text-xs h-8 gap-1"
            >
              Apply Link
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
