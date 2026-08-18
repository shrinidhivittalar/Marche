import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextField,
  Textarea,
  Skeleton,
} from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { ApiError } from '../../lib/api';
import { ImageUploader } from '../../components/media/ImageUploader';
import { marketplaceApi, profilesApi, type ApiServiceCard } from '../../lib/marketplace-api';

// Provider-side management for Module 3: create a listing, publish or
// unpublish it, delete it. Clients never see this page — creating a service
// is Provider-only in domain_rules.md, so a client landing here would only
// find controls that 403.

export const MyServicesPage: React.FC = () => {
  const { accessToken, currentUser, authLoading } = useApp();
  const token = accessToken;
  const isProvider = currentUser.role === 'vendor';

  const services = useApiResource(() => marketplaceApi.myServices(token as string), [token], {
    enabled: !!token && isProvider,
  });
  const categories = useApiResource(() => marketplaceApi.categories(), []);
  const skills = useApiResource(() => profilesApi.listSkills(token), [token], { enabled: !!token });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('');
  const [tags, setTags] = useState('');
  const [skillId, setSkillId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await action();
      // Awaited, so the list never disagrees with the message beside it.
      await services.refetch();
      setSuccess(message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  // The session is restored by a silent refresh after a page load, so on
  // first paint there is no access token yet. Rendering the create form
  // during that window lets someone fill it in and submit before the token
  // arrives — the request then fails with a bare "Unauthorized" through no
  // fault of theirs. Waiting is the honest behaviour.
  if (authLoading) {
    return (
      <Card className="p-10 text-center" data-testid="services-auth-loading">
        <p className="text-ink-muted">Loading…</p>
      </Card>
    );
  }

  if (!token) {
    return (
      <Card className="p-10 text-center" data-testid="services-signed-out">
        <p className="text-ink font-medium">Sign in to manage your services.</p>
      </Card>
    );
  }

  if (!isProvider) {
    return (
      <Card className="p-10 text-center" data-testid="services-not-provider">
        <p className="text-ink font-medium">Only providers can publish services.</p>
      </Card>
    );
  }

  // Only leaf categories are offered. A service must sit under something
  // specific — filing everything under "Photography & Video" would make the
  // child categories decorative and the parent filter useless.
  const leafCategories = (categories.data ?? []).flatMap((parent) =>
    (parent.children ?? []).map((child) => ({ ...child, parentName: parent.name })),
  );

  const create = () =>
    run(
      () =>
        marketplaceApi.createService(token as string, {
          title: title.trim(),
          description: description.trim(),
          categoryId,
          startingPrice: Number(price),
          deliveryDays: Number(deliveryDays),
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          skillIds: skillId ? [skillId] : undefined,
        }),
      'Service created as a draft.',
    ).then(() => {
      setTitle('');
      setDescription('');
      setPrice('');
      setDeliveryDays('');
      setTags('');
      setSkillId('');
    });

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="my-services-page">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Your services</h1>
        <p className="text-ink-muted text-sm mt-1">
          New listings start as drafts. Publish one to make it discoverable.
        </p>
      </div>

      <Card className="p-6 space-y-4" data-testid="create-service-card">
        <h2 className="text-lg font-semibold text-ink">Create a service</h2>

        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="service-title"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="service-description" className="text-sm font-medium text-ink">
            Description
          </label>
          <Textarea
            id="service-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="service-description"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger
              data-testid="service-category"
              aria-label="Category"
              className="h-auto py-2 text-sm"
            >
              <SelectValue placeholder="Choose a category…" />
            </SelectTrigger>
            <SelectContent>
              {leafCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.parentName} › {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            placeholder="Starting price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            data-testid="service-price"
            aria-label="Starting price"
          />
          <Input
            type="number"
            placeholder="Delivery days"
            value={deliveryDays}
            onChange={(e) => setDeliveryDays(e.target.value)}
            data-testid="service-delivery"
            aria-label="Delivery days"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Tags, comma separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            data-testid="service-tags"
            aria-label="Tags"
          />
          <Select value={skillId} onValueChange={setSkillId}>
            <SelectTrigger
              data-testid="service-skill"
              aria-label="Skill"
              className="h-auto py-2 text-sm"
            >
              <SelectValue placeholder="Add a skill (optional)…" />
            </SelectTrigger>
            <SelectContent>
              {(skills.data?.items ?? []).map((skill) => (
                <SelectItem key={skill.id} value={skill.id}>
                  {skill.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-ink-muted">
          Tags are free text and help people find you by keyword. Skills come from the platform list
          and are what the marketplace filters on.
        </p>

        <div className="flex items-center gap-3">
          <Button disabled={busy} onClick={create} data-testid="create-service">
            {busy ? 'Working…' : 'Create service'}
          </Button>
          {error && (
            <p data-testid="services-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {!error && success && (
            <p data-testid="services-success" role="status" className="text-sm text-success">
              {success}
            </p>
          )}
        </div>
      </Card>

      {services.loading && (
        <div className="space-y-3" data-testid="services-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {services.error && (
        <Card className="p-8 space-y-3" data-testid="services-load-error">
          <p className="text-danger">{services.error}</p>
          <Button onClick={() => void services.refetch()} data-testid="services-retry">
            Try again
          </Button>
        </Card>
      )}

      {!services.loading && services.data && (
        <div className="space-y-3" data-testid="service-list">
          {services.data.items.length === 0 && (
            <Card className="p-10 text-center" data-testid="services-empty">
              <p className="text-ink font-medium">You have no services yet.</p>
              <p className="text-ink-muted text-sm">Create one above to start getting found.</p>
            </Card>
          )}

          {services.data.items.map((s: ApiServiceCard) => (
            <Card
              key={s.id}
              className="p-5 space-y-3"
              data-testid="owned-service"
              data-service-title={s.title}
              data-service-status={s.status}
            >
              {editingId === s.id ? (
                <EditServiceForm
                  service={s}
                  token={token as string}
                  busy={busy}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) =>
                    run(
                      () => marketplaceApi.updateService(token as string, s.id, body),
                      'Service updated.',
                    ).then(() => setEditingId(null))
                  }
                  // Not folded into Save: the image is already attached by
                  // the time these resolve, so the editor stays open and the
                  // refetched list is what confirms it.
                  onAttachImage={(mediaId) =>
                    void run(
                      () => marketplaceApi.addServiceImage(token as string, s.id, mediaId),
                      'Image added.',
                    )
                  }
                  onDetachImage={(imageId) =>
                    void run(
                      () => marketplaceApi.removeServiceImage(token as string, s.id, imageId),
                      'Image removed.',
                    )
                  }
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-ink">{s.title}</h3>
                    <p className="text-xs text-ink-muted">
                      {s.category.name} · ₹{s.startingPrice} · {s.deliveryDays} days
                    </p>
                    <span
                      data-testid={`status-${s.id}`}
                      className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted"
                    >
                      {s.status ?? 'DRAFT'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      data-testid={`edit-${s.id}`}
                      onClick={() => setEditingId(s.id)}
                    >
                      Edit
                    </Button>
                    {s.status === 'PUBLISHED' ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        data-testid={`unpublish-${s.id}`}
                        onClick={() =>
                          run(
                            () =>
                              marketplaceApi.setServiceVisibility(
                                token as string,
                                s.id,
                                'UNPUBLISHED',
                              ),
                            'Service unpublished.',
                          )
                        }
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        disabled={busy}
                        data-testid={`publish-${s.id}`}
                        onClick={() =>
                          run(
                            () =>
                              marketplaceApi.setServiceVisibility(
                                token as string,
                                s.id,
                                'PUBLISHED',
                              ),
                            'Service published.',
                          )
                        }
                      >
                        Publish
                      </Button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete ${s.title}`}
                      data-testid={`delete-${s.id}`}
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => marketplaceApi.deleteService(token as string, s.id),
                          'Service deleted.',
                        )
                      }
                      className="text-ink-muted hover:text-danger"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// Inline editor, mounted only for the row being edited and seeded from that
// row's current values. PATCH /services/:id existed and was tested from the
// day the API shipped, but nothing in the UI called it — a provider could
// publish and delete a listing yet never correct a typo in its title.
//
// Status is deliberately absent: it moves through the publish/unpublish
// buttons, which is the one auditable path for a visibility change.
// Matches ServicesService.MAX_IMAGES. The cap exists because these ride on
// every card of a browse page, unlike a portfolio a client opens on purpose.
const MAX_SERVICE_IMAGES = 8;

// Images are not part of the edit form's body. They have their own
// endpoints and are attached the moment they upload, so what is rendered
// here is the saved server state rather than a draft — there is nothing to
// discard on Cancel.
function ServiceImagesEditor({
  service,
  token,
  disabled,
  onAttach,
  onDetach,
}: {
  service: ApiServiceCard;
  token: string;
  disabled: boolean;
  onAttach: (mediaId: string) => void;
  onDetach: (imageId: string) => void;
}) {
  const attached = service.images ?? [];
  const images = attached.map((image) => ({
    mediaId: image.mediaId,
    fileName: 'Service image',
    url: image.url ?? undefined,
  }));

  return (
    <ImageUploader
      token={token}
      images={images}
      max={MAX_SERVICE_IMAGES}
      disabled={disabled}
      label="Listing images"
      onChange={(next) => {
        // The uploader hands back the whole list, so what changed is a
        // diff. Matching on mediaId and translating to the attachment id is
        // what keeps a delete pointed at this listing's row rather than the
        // underlying file, which other listings may also use.
        const added = next.find((image) => !attached.some((a) => a.mediaId === image.mediaId));
        if (added) {
          onAttach(added.mediaId);
          return;
        }

        const removed = attached.find((a) => !next.some((image) => image.mediaId === a.mediaId));
        if (removed) onDetach(removed.id);
      }}
    />
  );
}

function EditServiceForm({
  service,
  token,
  busy,
  onCancel,
  onSave,
  onAttachImage,
  onDetachImage,
}: {
  service: ApiServiceCard;
  token: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
  onAttachImage: (mediaId: string) => void;
  onDetachImage: (imageId: string) => void;
}) {
  const [title, setTitle] = useState(service.title);
  const [description, setDescription] = useState(service.description ?? '');
  const [price, setPrice] = useState(String(service.startingPrice));
  const [deliveryDays, setDeliveryDays] = useState(String(service.deliveryDays));
  const [tags, setTags] = useState((service.tags ?? []).join(', '));

  return (
    <div className="space-y-3" data-testid={`edit-form-${service.id}`}>
      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        data-testid="edit-title"
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`edit-description-${service.id}`} className="text-sm font-medium text-ink">
          Description
        </label>
        <Textarea
          id={`edit-description-${service.id}`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="edit-description"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          data-testid="edit-price"
          aria-label="Starting price"
        />
        <Input
          type="number"
          value={deliveryDays}
          onChange={(e) => setDeliveryDays(e.target.value)}
          data-testid="edit-delivery"
          aria-label="Delivery days"
        />
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          data-testid="edit-tags"
          aria-label="Tags"
          placeholder="Tags, comma separated"
        />
      </div>

      <ServiceImagesEditor
        service={service}
        token={token}
        disabled={busy}
        onAttach={onAttachImage}
        onDetach={onDetachImage}
      />

      <div className="flex items-center gap-2">
        <Button
          disabled={busy}
          data-testid="save-edit"
          onClick={() =>
            onSave({
              title: title.trim(),
              description: description.trim(),
              startingPrice: Number(price),
              deliveryDays: Number(deliveryDays),
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        >
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={busy} data-testid="cancel-edit" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
