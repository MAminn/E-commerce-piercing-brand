import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "#root/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#root/components/ui/card";
import { Input } from "#root/components/ui/input";
import { Label } from "#root/components/ui/label";
import { Switch } from "#root/components/ui/switch";
import { Textarea } from "#root/components/ui/textarea";
import { Alert, AlertDescription } from "#root/components/ui/alert";
import {
  OWNER_INPUT_MARKER,
  countOwnerInputPlaceholders,
  isLegalPagePublished,
} from "#root/shared/legal/legal-pages";
import type {
  HomepageLegalPageContent,
  HomepageLegalPageSection,
} from "#root/shared/types/homepage-content";

/**
 * Editor for one legal page (/terms or /privacy).
 *
 * Unlike the Return Policy card, fields stay editable while the page is
 * switched off, so the draft can be completed before it goes live. A page
 * only goes live once it is switched on AND every owner-input placeholder is
 * gone — the notice below says which of the two is still missing.
 */
export function LegalPageEditor({
  heading,
  route,
  value,
  onChange,
}: {
  heading: string;
  route: string;
  value: HomepageLegalPageContent;
  onChange: (next: HomepageLegalPageContent) => void;
}) {
  const set = (patch: Partial<HomepageLegalPageContent>) =>
    onChange({ ...value, ...patch });
  const setSection = (index: number, patch: Partial<HomepageLegalPageSection>) =>
    set({
      sections: value.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  const moveSection = (index: number, by: -1 | 1) => {
    const sections = [...value.sections];
    const [moved] = sections.splice(index, 1);
    if (!moved) return;
    sections.splice(index + by, 0, moved);
    set({ sections });
  };

  const placeholders = countOwnerInputPlaceholders(value);
  const live = isLegalPagePublished(value);

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-base'>
            {heading} <span className='text-muted-foreground font-normal'>{route}</span>
          </CardTitle>
          <Switch
            checked={value.enabled}
            onCheckedChange={(checked) => set({ enabled: checked })}
          />
        </div>
      </CardHeader>
      <CardContent className='space-y-6'>
        {placeholders > 0 ? (
          <Alert className='border-amber-300 bg-amber-50 text-amber-900'>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              {placeholders} place{placeholders === 1 ? "" : "s"} still contain
              “{OWNER_INPUT_MARKER}…]”. Replace each one with the real
              information, or delete that section. Until then {route} shows
              “not available yet” and is not linked in the footer
              {value.enabled ? ", even though it is switched on" : ""}.
            </AlertDescription>
          </Alert>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {live
              ? `Live at ${route} and linked in the footer under Policies.`
              : `Switch on to publish at ${route} and link it in the footer.`}
          </p>
        )}
        <p className='text-xs text-muted-foreground'>
          Arabic fields left empty show the English text. Review the wording
          with whoever is responsible for the business&apos;s legal terms
          before publishing.
        </p>

        <div className='grid grid-cols-2 gap-4'>
          <div>
            <Label className='text-xs'>Title (English)</Label>
            <Input value={value.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div>
            <Label className='text-xs'>Title (Arabic)</Label>
            <Input
              dir='rtl'
              value={value.titleAr ?? ""}
              onChange={(e) => set({ titleAr: e.target.value })}
            />
          </div>
        </div>

        <div className='grid grid-cols-2 gap-4'>
          <div>
            <Label className='text-xs'>Last updated line (English, optional)</Label>
            <Input
              value={value.lastUpdated ?? ""}
              onChange={(e) => set({ lastUpdated: e.target.value })}
              placeholder='e.g. Last updated 1 March 2027'
            />
          </div>
          <div>
            <Label className='text-xs'>Last updated line (Arabic, optional)</Label>
            <Input
              dir='rtl'
              value={value.lastUpdatedAr ?? ""}
              onChange={(e) => set({ lastUpdatedAr: e.target.value })}
            />
          </div>
        </div>

        <div className='grid grid-cols-2 gap-4'>
          <div>
            <Label className='text-xs'>Intro (English)</Label>
            <Textarea
              rows={3}
              value={value.intro}
              onChange={(e) => set({ intro: e.target.value })}
            />
          </div>
          <div>
            <Label className='text-xs'>Intro (Arabic)</Label>
            <Textarea
              dir='rtl'
              rows={3}
              value={value.introAr ?? ""}
              onChange={(e) => set({ introAr: e.target.value })}
            />
          </div>
        </div>

        <div className='space-y-4'>
          <Label className='text-sm font-medium'>Sections</Label>
          {value.sections.map((section, index) => (
            <div key={index} className='border rounded-lg p-4 space-y-3 bg-muted/30'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-medium text-muted-foreground'>
                  Section {index + 1}
                </span>
                <div className='flex items-center gap-1'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={index === 0}
                    onClick={() => moveSection(index, -1)}
                    aria-label='Move section up'>
                    <ChevronUp className='w-4 h-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    disabled={index === value.sections.length - 1}
                    onClick={() => moveSection(index, 1)}
                    aria-label='Move section down'>
                    <ChevronDown className='w-4 h-4' />
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() =>
                      set({ sections: value.sections.filter((_, i) => i !== index) })
                    }
                    aria-label='Delete section'>
                    <Trash2 className='w-4 h-4' />
                  </Button>
                </div>
              </div>
              <div className='grid grid-cols-2 gap-4'>
                <Input
                  value={section.title}
                  onChange={(e) => setSection(index, { title: e.target.value })}
                  placeholder='Heading (English)'
                />
                <Input
                  dir='rtl'
                  value={section.titleAr ?? ""}
                  onChange={(e) => setSection(index, { titleAr: e.target.value })}
                  placeholder='Heading (Arabic)'
                />
                <Textarea
                  rows={4}
                  value={section.body}
                  onChange={(e) => setSection(index, { body: e.target.value })}
                  placeholder='Text (English)'
                />
                <Textarea
                  dir='rtl'
                  rows={4}
                  value={section.bodyAr ?? ""}
                  onChange={(e) => setSection(index, { bodyAr: e.target.value })}
                  placeholder='Text (Arabic)'
                />
              </div>
            </div>
          ))}
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() =>
              set({
                sections: [
                  ...value.sections,
                  { title: "", titleAr: "", body: "", bodyAr: "" },
                ],
              })
            }>
            <Plus className='w-4 h-4 mr-1' />
            Add section
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
