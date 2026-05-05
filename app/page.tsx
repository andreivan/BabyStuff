"use client";

import { ChangeEvent, Children, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const ACCESS_CODE = "2026Baby";
const AUTH_KEY = "baby-inventory-auth";
const STORAGE_KEY = "baby-inventory-items";
const GROUPS_KEY = "baby-inventory-groups";

const defaultCategories = ["Newborn", "1-3m", "3-6m", "6-9m", "9-12m", "1-2y", "2-3y", "General"];

type Category = string;

type BabyItem = {
  id: string;
  name: string;
  owned: number;
  desired: number;
  imageUrl?: string;
  note?: string;
  category: Category;
  createdAt: string;
};

type BabyItemRow = {
  id: string;
  name: string;
  owned: number;
  desired: number;
  image_url: string | null;
  note: string | null;
  category: string;
  created_at: string;
};

type BabyGroupRow = {
  name: string;
};

type ItemDraft = {
  name: string;
  owned: string;
  desired: string;
  imageUrl: string;
  note: string;
  category: Category;
};

type ModalMode = "stock" | "wishlist";

const createEmptyDraft = (mode: ModalMode): ItemDraft => ({
  name: "",
  owned: mode === "stock" ? "1" : "0",
  desired: "1",
  imageUrl: "",
  note: "",
  category: "Newborn",
});

const seedItems: BabyItem[] = [
  makeSeedItem("newborn-top-sleeveless", "Top sleeveless", 6, "Newborn"),
  makeSeedItem("newborn-shorts", "Shorts", 5, "Newborn"),
  makeSeedItem("newborn-long-pants", "Long pants", 2, "Newborn"),
  makeSeedItem("newborn-kutang", "Kutang", 2, "Newborn"),
  makeSeedItem("newborn-sleep-jumper", "Sleep jumper", 5, "Newborn"),
  makeSeedItem("newborn-normal-jumper", "Normal jumper", 8, "Newborn"),
  makeSeedItem("newborn-socks", "Socks", 5, "Newborn"),
  makeSeedItem("newborn-mitten", "Mitten", 1, "Newborn"),
  makeSeedItem("newborn-gloves", "Gloves", 3, "Newborn"),
  makeSeedItem("1-3m-jumper", "Jumper", 9, "1-3m"),
  makeSeedItem("1-3m-sleep-jumper", "Sleep jumper", 1, "1-3m"),
  makeSeedItem("3-6m-jumper", "Jumper", 1, "3-6m"),
  makeSeedItem("3-6m-sleep-jumper", "Sleep jumper", 1, "3-6m"),
  makeSeedItem("3-6m-baju-jalan", "Baju jalan set", 2, "3-6m"),
  makeSeedItem("6-9m-jumper", "Jumper", 4, "6-9m"),
  makeSeedItem("6-9m-bib", "Bib", 2, "6-9m"),
  makeSeedItem("general-outside-shorts", "Going outside shorts", 3, "General"),
  makeSeedItem("general-outside-long-pants", "Going outside long pants", 1, "General"),
  makeSeedItem("general-outside-dresses", "Going outside dresses", 2, "General"),
  makeSeedItem("general-outside-top", "Going outside top", 2, "General"),
  makeSeedItem("general-outside-jumper", "Going outside jumper", 2, "General"),
];

function makeSeedItem(id: string, name: string, quantity: number, category: Category): BabyItem {
  return {
    id: `seed-${id}`,
    name,
    owned: quantity,
    desired: quantity,
    category,
    createdAt: new Date("2026-05-05").toISOString(),
  };
}

function normalizeBackupItems(parsed: unknown): BabyItem[] {
  const maybeItems =
    typeof parsed === "object" && parsed !== null && "items" in parsed
      ? (parsed as { items?: unknown }).items
      : parsed;

  if (!Array.isArray(maybeItems)) {
    throw new Error("Backup did not contain an item list.");
  }

  return maybeItems.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Backup contained an invalid item.");
    }

    const candidate = item as Partial<BabyItem>;
    const category =
      typeof candidate.category === "string" && candidate.category.trim() ? candidate.category.trim() : "General";
    const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : `Imported item ${index + 1}`;
    const owned = Math.max(0, Number(candidate.owned) || 0);
    const desired = Math.max(1, Number(candidate.desired) || 1);

    return {
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : crypto.randomUUID(),
      name,
      owned,
      desired,
      imageUrl: typeof candidate.imageUrl === "string" && candidate.imageUrl.trim() ? candidate.imageUrl.trim() : undefined,
      note: typeof candidate.note === "string" && candidate.note.trim() ? candidate.note.trim() : undefined,
      category,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    };
  });
}

function normalizeBackupGroups(parsed: unknown, incomingItems: BabyItem[]): Category[] {
  const maybeGroups =
    typeof parsed === "object" && parsed !== null && "groups" in parsed
      ? (parsed as { groups?: unknown }).groups
      : undefined;
  const importedGroups = Array.isArray(maybeGroups)
    ? maybeGroups.filter((group): group is string => typeof group === "string" && group.trim().length > 0).map((group) => group.trim())
    : [];
  const itemGroups = incomingItems.map((item) => item.category);

  return uniqueGroups([...defaultCategories, ...importedGroups, ...itemGroups]);
}

function uniqueGroups(groups: Category[]): Category[] {
  return groups.reduce<Category[]>((unique, group) => {
    const trimmed = group.trim();
    const alreadyExists = unique.some((value) => value.toLowerCase() === trimmed.toLowerCase());

    if (trimmed && !alreadyExists) unique.push(trimmed);
    return unique;
  }, []);
}

const babyItemStore = {
  async load(): Promise<BabyItem[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from("baby_items")
        .select("id,name,owned,desired,image_url,note,category,created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data.length > 0) return data.map(fromBabyItemRow);

      const starterItems = loadLocalItems() ?? seedItems;
      const { data: inserted, error: insertError } = await supabase
        .from("baby_items")
        .insert(starterItems.map(toBabyItemInsert))
        .select("id,name,owned,desired,image_url,note,category,created_at");

      if (insertError) throw insertError;
      return inserted.map(fromBabyItemRow);
    }

    if (typeof window === "undefined") return seedItems;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as BabyItem[]) : seedItems;
    } catch {
      return seedItems;
    }
  },
  saveLocal(items: BabyItem[]) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  },
  async insert(item: BabyItem): Promise<BabyItem> {
    if (!supabase) return item;

    const { data, error } = await supabase
      .from("baby_items")
      .insert(toBabyItemInsert(item))
      .select("id,name,owned,desired,image_url,note,category,created_at")
      .single();

    if (error) throw error;
    return fromBabyItemRow(data);
  },
  async update(id: string, values: Partial<Pick<BabyItem, "owned" | "desired" | "note">>) {
    if (!supabase) return;

    const { error } = await supabase
      .from("baby_items")
      .update(values)
      .eq("id", id);

    if (error) throw error;
  },
  async remove(id: string) {
    if (!supabase) return;

    const { error } = await supabase.from("baby_items").delete().eq("id", id);
    if (error) throw error;
  },
  async replaceAll(items: BabyItem[]) {
    if (!supabase) return;

    const { error: deleteError } = await supabase.from("baby_items").delete().neq("name", "");
    if (deleteError) throw deleteError;

    if (items.length === 0) return;

    const { error: insertError } = await supabase.from("baby_items").insert(items.map(toBabyItemInsert));
    if (insertError) throw insertError;
  },
};

function loadLocalItems(): BabyItem[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return normalizeBackupItems(parsed);
  } catch {
    return null;
  }
}

const babyGroupStore = {
  async load(items: BabyItem[]): Promise<Category[]> {
    if (supabase) {
      const { data, error } = await supabase
        .from("baby_groups")
        .select("name")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return uniqueGroups([...defaultCategories, ...data.map((group: BabyGroupRow) => group.name), ...items.map((item) => item.category)]);
    }

    if (typeof window === "undefined") return defaultCategories;

    try {
      const raw = window.localStorage.getItem(GROUPS_KEY);
      const savedGroups = raw ? (JSON.parse(raw) as unknown) : [];
      const groups = Array.isArray(savedGroups)
        ? savedGroups.filter((group): group is string => typeof group === "string")
        : [];

      return uniqueGroups([...defaultCategories, ...groups, ...items.map((item) => item.category)]);
    } catch {
      return uniqueGroups([...defaultCategories, ...items.map((item) => item.category)]);
    }
  },
  async save(groups: Category[]) {
    if (supabase) {
      const rows = uniqueGroups(groups).map((name, index) => ({ name, sort_order: index + 1 }));
      const { error } = await supabase.from("baby_groups").upsert(rows, { onConflict: "name" });
      if (error) throw error;
      return;
    }

    window.localStorage.setItem(GROUPS_KEY, JSON.stringify(uniqueGroups(groups)));
  },
};

function fromBabyItemRow(row: BabyItemRow): BabyItem {
  return {
    id: row.id,
    name: row.name,
    owned: row.owned,
    desired: row.desired,
    imageUrl: row.image_url ?? undefined,
    note: row.note ?? undefined,
    category: row.category,
    createdAt: row.created_at,
  };
}

function toBabyItemInsert(item: BabyItem) {
  return {
    name: item.name,
    owned: item.owned,
    desired: item.desired,
    image_url: item.imageUrl ?? null,
    note: item.note ?? null,
    category: item.category,
    created_at: item.createdAt,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "Unknown Supabase error";
}

export default function Home() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [code, setCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [items, setItems] = useState<BabyItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("stock");
  const [draft, setDraft] = useState<ItemDraft>(createEmptyDraft("stock"));
  const [collapsedCategories, setCollapsedCategories] = useState<Category[]>([]);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [importError, setImportError] = useState("");
  const [syncError, setSyncError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function hydrate() {
      try {
        const savedItems = await babyItemStore.load();
        const savedCategories = await babyGroupStore.load(savedItems);

        setItems(savedItems);
        setCategories(savedCategories);
        setSyncError("");
      } catch {
        setItems(seedItems);
        setCategories(defaultCategories);
        setSyncError("Supabase could not load data. Check the API URL, publishable key, and that supabase-schema.sql has been run.");
      } finally {
        setIsAuthed(window.localStorage.getItem(AUTH_KEY) === "granted");
        setIsReady(true);
      }
    }

    void hydrate();
  }, []);

  useEffect(() => {
    if (isReady && !isSupabaseConfigured) babyItemStore.saveLocal(items);
  }, [items, isReady]);

  useEffect(() => {
    if (!isReady) return;

    babyGroupStore.save(categories).catch((error) => {
      setSyncError(`Could not save groups to Supabase: ${getErrorMessage(error)}`);
    });
  }, [categories, isReady]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.owned += item.owned;
        if (item.owned < item.desired) acc.wishlist += item.desired - item.owned;
        return acc;
      },
      { owned: 0, wishlist: 0 },
    );
  }, [items]);

  const categorySummaries = useMemo(() => {
    return categories.map((category) => {
      const categoryItems = items.filter((item) => item.category === category);
      const ownedTotal = categoryItems.reduce((sum, item) => sum + item.owned, 0);
      const wishlistTotal = categoryItems.reduce((sum, item) => sum + Math.max(0, item.desired - item.owned), 0);

      return {
        category,
        ownedTotal,
        wishlistTotal,
        itemCount: categoryItems.length,
      };
    });
  }, [categories, items]);

  const visibleItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) => {
      return [item.name, item.category, item.note ?? ""].some((value) => value.toLowerCase().includes(query));
    });
  }, [items, searchTerm]);

  const hasActiveSearch = searchTerm.trim().length > 0;

  function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (code.trim() === ACCESS_CODE) {
      window.localStorage.setItem(AUTH_KEY, "granted");
      setIsAuthed(true);
      setAuthError("");
      return;
    }

    setAuthError("A little off. Try the family code again.");
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draft.name.trim();
    if (!name) return;

    const owned = Math.max(0, Number.parseInt(draft.owned, 10) || 0);
    const desired = Math.max(1, Number.parseInt(draft.desired, 10) || 1);

    const newItem: BabyItem = {
      id: crypto.randomUUID(),
      name,
      owned,
      desired,
      category: draft.category,
      imageUrl: draft.imageUrl.trim() || undefined,
      note: draft.note.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    setItems((current) => [newItem, ...current]);
    setDraft(createEmptyDraft(modalMode));
    setIsModalOpen(false);

    try {
      const savedItem = await babyItemStore.insert(newItem);
      setItems((current) => current.map((item) => (item.id === newItem.id ? savedItem : item)));
      setSyncError("");
    } catch {
      setSyncError("Could not save the new item to Supabase. Check the API key, table setup, and policies.");
    }
  }

  function updateQuantity(id: string, field: "owned" | "desired", value: string) {
    const quantity = Math.max(field === "desired" ? 1 : 0, Number.parseInt(value, 10) || 0);

    setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: quantity } : item)));
    babyItemStore.update(id, { [field]: quantity }).catch(() => {
      setSyncError("Could not save that quantity change to Supabase.");
    });
  }

  function updateNote(id: string, note: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, note: note.trim() || undefined } : item)));
    babyItemStore.update(id, { note: note.trim() || undefined }).catch(() => {
      setSyncError("Could not save that note to Supabase.");
    });
  }

  function removeFromWishlist(id: string) {
    const itemToUpdate = items.find((item) => item.id === id);

    setItems((current) =>
      current.flatMap((item) => {
        if (item.id !== id) return [item];
        if (item.owned === 0) return [];
        return [{ ...item, desired: item.owned }];
      }),
    );

    if (!itemToUpdate) return;

    if (itemToUpdate.owned === 0) {
      babyItemStore.remove(id).catch(() => {
        setSyncError("Could not remove that wishlist item from Supabase.");
      });
      return;
    }

    babyItemStore.update(id, { desired: itemToUpdate.owned }).catch(() => {
      setSyncError("Could not remove that item from the wishlist in Supabase.");
    });
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    babyItemStore.remove(id).catch(() => {
      setSyncError("Could not delete that item from Supabase.");
    });
  }

  function openAddModal(mode: ModalMode) {
    setModalMode(mode);
    setDraft({ ...createEmptyDraft(mode), category: categories[0] ?? "General" });
    setIsModalOpen(true);
  }

  function addGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const groupName = newGroupName.trim();
    if (!groupName) return;

    const exists = categories.some((category) => category.toLowerCase() === groupName.toLowerCase());
    if (exists) {
      setGroupError("That group already exists.");
      return;
    }

    setCategories((current) => [...current, groupName]);
    setDraft((current) => ({ ...current, category: groupName }));
    setCollapsedCategories((current) => current.filter((category) => category !== groupName));
    setNewGroupName("");
    setGroupError("");
  }

  function exportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "baby-inventory-wishlist",
      version: 1,
      groups: categories,
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `baby-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const incomingItems = normalizeBackupItems(parsed);
      const incomingGroups = normalizeBackupGroups(parsed, incomingItems);

      setItems(incomingItems);
      setCategories(incomingGroups);
      await babyItemStore.replaceAll(incomingItems);
      await babyGroupStore.save(incomingGroups);
      setImportError("");
      setSyncError("");
    } catch {
      setImportError("That backup file could not be read. Try exporting again from this app.");
    } finally {
      event.target.value = "";
    }
  }

  function toggleCategory(category: Category) {
    setCollapsedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  if (!isReady) {
    return <main className="min-h-screen bg-oatmeal-100" />;
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-24 pt-5 text-charcoal-700 sm:px-6">
      <div className="pointer-events-none absolute -left-24 top-12 h-64 w-64 animate-breathe rounded-full bg-sage-200/50 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-96 h-72 w-72 rounded-full bg-clay/20 blur-3xl" />

      <section className="relative mx-auto flex max-w-xl flex-col gap-5">
        <header className="paper-grain rounded-imperfect border border-white/60 p-6 shadow-soft">
          <p className="mb-3 text-xs uppercase tracking-[0.34em] text-sage-500">Baby inventory</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl leading-none text-charcoal-900">Tiny things, gently kept.</h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-charcoal-500">
                Track what is already tucked away and what still belongs on the wishlist.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                className="touch-target rounded-full bg-charcoal-900 px-4 text-sm text-rice shadow-card transition hover:-translate-y-0.5 hover:bg-charcoal-700"
                onClick={() => openAddModal("stock")}
              >
                Add stock
              </button>
              <button
                className="touch-target rounded-full bg-sage-500 px-4 text-sm text-rice shadow-card transition hover:-translate-y-0.5 hover:bg-charcoal-700"
                onClick={() => openAddModal("wishlist")}
              >
                Add wish
              </button>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <Stat label="Owned" value={totals.owned} />
          <Stat label="Wishlist" value={totals.wishlist} />
        </section>

        {syncError && (
          <section className="rounded-[2rem] border border-clay/30 bg-rice/85 p-4 text-sm leading-6 text-clay shadow-card">
            {syncError}
          </section>
        )}

        <section className="rounded-[2rem] border border-white/60 bg-rice/82 p-4 shadow-card backdrop-blur">
          <label className="block text-sm text-charcoal-700" htmlFor="search">
            Search items or notes
          </label>
          <input
            id="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="field-input"
            placeholder="socks, jumper, Shopee link..."
          />
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-rice/82 p-4 shadow-card backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-charcoal-900">Size overview</h2>
            <span className="rounded-full bg-oatmeal-100 px-3 py-1 text-xs text-charcoal-500">Owned by group</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {categorySummaries
              .filter(
                (summary) =>
                  summary.itemCount > 0 ||
                  !defaultCategories.some((category) => category.toLowerCase() === summary.category.toLowerCase()),
              )
              .map((summary) => (
                <div key={summary.category} className="rounded-2xl border border-oatmeal-200 bg-white/45 px-3 py-2">
                  <p className="text-sm font-semibold text-charcoal-900">{summary.category}</p>
                  <p className="text-xs text-charcoal-500">
                    {summary.ownedTotal} owned
                    {summary.wishlistTotal > 0 ? `, ${summary.wishlistTotal} wish` : ""}
                  </p>
                </div>
              ))}
          </div>

          <form onSubmit={addGroup} className="mt-4 rounded-2xl border border-dashed border-sage-200 bg-oatmeal-50/70 p-3">
            <label className="block text-sm text-charcoal-700" htmlFor="new-group">
              Add new group
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="new-group"
                value={newGroupName}
                onChange={(event) => {
                  setNewGroupName(event.target.value);
                  setGroupError("");
                }}
                className="min-w-0 flex-1 rounded-full border border-sage-200 bg-rice px-4 py-3 text-charcoal-900 outline-none transition focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
                placeholder="1 year, 2 year..."
              />
              <button className="touch-target rounded-full bg-charcoal-900 px-4 text-sm text-rice shadow-card transition hover:bg-charcoal-700">
                Add
              </button>
            </div>
            {groupError && <p className="mt-2 text-sm text-clay">{groupError}</p>}
          </form>
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-rice/82 p-4 shadow-card backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={exportBackup}
              className="touch-target flex-1 rounded-full bg-charcoal-900 px-4 text-sm text-rice shadow-card transition hover:bg-charcoal-700"
            >
              Export JSON backup
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="touch-target flex-1 rounded-full bg-sage-500 px-4 text-sm text-rice shadow-card transition hover:bg-charcoal-700"
            >
              Import JSON backup
            </button>
          </div>
          <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
          {importError && <p className="mt-3 text-sm text-clay">{importError}</p>}
          <p className="mt-3 text-xs leading-5 text-charcoal-500">
            Export keeps a copy outside this browser. Import replaces the current local list with the backup file.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          {hasActiveSearch && visibleItems.length === 0 && (
            <p className="rounded-[2rem] border border-dashed border-sage-200 bg-rice/70 px-5 py-6 text-center text-sm text-charcoal-500">
              Nothing matched &quot;{searchTerm.trim()}&quot;. Try another item name, note, or category.
            </p>
          )}

          {categories.map((category) => {
            const categoryItems = visibleItems
              .filter((item) => item.category === category)
              .sort((a, b) => Number(a.owned >= a.desired) - Number(b.owned >= b.desired));
            const wishlist = categoryItems.filter((item) => item.owned < item.desired);
            const owned = categoryItems.filter((item) => item.owned >= item.desired);
            const ownedTotal = categoryItems.reduce((sum, item) => sum + item.owned, 0);
            const wishlistTotal = categoryItems.reduce((sum, item) => sum + Math.max(0, item.desired - item.owned), 0);
            const isCollapsed = collapsedCategories.includes(category);

            if (categoryItems.length === 0) return null;

            return (
              <article key={category} className="rounded-[2rem] border border-white/60 bg-rice/82 p-4 shadow-card backdrop-blur">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                  aria-expanded={!isCollapsed}
                >
                  <div>
                    <h2 className="font-display text-2xl text-charcoal-900">{category}</h2>
                    <p className="mt-1 text-sm text-charcoal-500">
                      {ownedTotal} owned
                      {wishlistTotal > 0 ? `, ${wishlistTotal} wishlist` : ""}
                    </p>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-oatmeal-100 text-xl text-charcoal-500 transition">
                    {isCollapsed ? "+" : "-"}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="animate-rise">
                    <ItemGroup label="Wishlist" emptyLabel="Wishlist is quiet here.">
                      {wishlist.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onQuantityChange={(field, value) => updateQuantity(item.id, field, value)}
                          onNoteChange={(note) => updateNote(item.id, note)}
                          onRemoveWishlist={() => removeFromWishlist(item.id)}
                          onDelete={() => deleteItem(item.id)}
                        />
                      ))}
                    </ItemGroup>

                    <ItemGroup label="Owned" emptyLabel="Nothing fully gathered yet.">
                      {owned.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onQuantityChange={(field, value) => updateQuantity(item.id, field, value)}
                          onNoteChange={(note) => updateNote(item.id, note)}
                          onRemoveWishlist={() => removeFromWishlist(item.id)}
                          onDelete={() => deleteItem(item.id)}
                        />
                      ))}
                    </ItemGroup>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </section>

      {!isAuthed && (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/55 px-5 backdrop-blur-sm">
          <form
            onSubmit={handleUnlock}
            className="paper-grain w-full max-w-sm rounded-imperfect border border-white/60 p-7 shadow-soft"
          >
            <p className="text-xs uppercase tracking-[0.32em] text-sage-500">Private nest</p>
            <h2 className="mt-3 font-display text-3xl text-charcoal-900">A small gate at the garden path.</h2>
            <p className="mt-3 text-sm leading-6 text-charcoal-500">Enter the access code to open the inventory on this device.</p>
            <label className="mt-6 block text-sm text-charcoal-700" htmlFor="access-code">
              Access code
            </label>
            <input
              id="access-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-sage-200 bg-rice px-4 py-3 text-charcoal-900 outline-none transition focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
              type="password"
              autoFocus
            />
            {authError && <p className="mt-3 text-sm text-clay">{authError}</p>}
            <button className="touch-target mt-5 w-full rounded-full bg-charcoal-900 text-rice shadow-card transition hover:bg-charcoal-700">
              Enter softly
            </button>
          </form>
        </section>
      )}

      {isModalOpen && (
        <section className="fixed inset-0 z-40 flex items-end bg-charcoal-900/35 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <form
            onSubmit={addItem}
            className="w-full max-w-xl animate-rise rounded-[2rem] border border-white/60 bg-rice p-5 shadow-soft"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-sage-500">New item</p>
                <h2 className="font-display text-3xl text-charcoal-900">
                  {modalMode === "wishlist" ? "Add to wishlist" : "Add to the basket"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="touch-target rounded-full bg-oatmeal-100 text-charcoal-700"
                aria-label="Close modal"
              >
                x
              </button>
            </div>

            <div className="grid gap-4">
              <Field label="Item name">
                <input
                  required
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className="field-input"
                  placeholder="Organic sleep sack"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Owned">
                  <input
                    min="0"
                    type="number"
                    value={draft.owned}
                    onChange={(event) => setDraft({ ...draft, owned: event.target.value })}
                    className="field-input"
                  />
                </Field>
                <Field label="Desired">
                  <input
                    min="1"
                    type="number"
                    value={draft.desired}
                    onChange={(event) => setDraft({ ...draft, desired: event.target.value })}
                    className="field-input"
                  />
                </Field>
              </div>

              <Field label="Image URL optional">
                <input
                  value={draft.imageUrl}
                  onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
                  className="field-input"
                  placeholder="https://..."
                />
              </Field>

              <Field label="Notes optional">
                <textarea
                  value={draft.note}
                  onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                  className="field-input min-h-24 resize-none"
                  placeholder="Bought by mum, hospital bag, Shopee link..."
                />
              </Field>

              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  className="field-input"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <button className="touch-target mt-6 w-full rounded-full bg-sage-500 text-rice shadow-card transition hover:bg-charcoal-700">
              {modalMode === "wishlist" ? "Save wishlist item" : "Save stock item"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-rice/80 px-3 py-4 text-center shadow-card backdrop-blur">
      <p className="font-display text-3xl leading-none text-charcoal-900">{value}</p>
      <p className="mt-1 text-[0.68rem] uppercase tracking-[0.18em] text-sage-500">{label}</p>
    </div>
  );
}

function ItemGroup({ label, emptyLabel, children }: { label: string; emptyLabel: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs uppercase tracking-[0.24em] text-sage-500">{label}</p>
      <div className="flex flex-col gap-3">{Children.count(children) === 0 ? <EmptyNote text={emptyLabel} /> : children}</div>
    </div>
  );
}

function ItemCard({
  item,
  onQuantityChange,
  onNoteChange,
  onRemoveWishlist,
  onDelete,
}: {
  item: BabyItem;
  onQuantityChange: (field: "owned" | "desired", value: string) => void;
  onNoteChange: (note: string) => void;
  onRemoveWishlist: () => void;
  onDelete: () => void;
}) {
  const complete = item.owned >= item.desired;

  return (
    <div className="animate-rise rounded-[1.6rem] border border-oatmeal-200 bg-white/55 p-3 shadow-sm transition duration-300 hover:-translate-y-0.5">
      <div className="flex gap-3">
        <Thumbnail item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="break-words text-base font-semibold text-charcoal-900">{item.name}</h3>
              <p className="mt-1 text-sm text-charcoal-500">
                {item.owned} of {item.desired} gathered
              </p>
            </div>
            <button
              onClick={onDelete}
              className="rounded-full px-2 py-1 text-xs text-charcoal-500 transition hover:bg-oatmeal-100 hover:text-clay"
            >
              Delete
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <QuantityField label="Owned" value={item.owned} min={0} onChange={(value) => onQuantityChange("owned", value)} />
            <QuantityField label="Desired" value={item.desired} min={1} onChange={(value) => onQuantityChange("desired", value)} />
          </div>

          <label className="mt-3 block rounded-2xl border border-oatmeal-200 bg-rice/60 px-3 py-2 text-xs uppercase tracking-[0.14em] text-sage-500">
            Notes
            <textarea
              value={item.note ?? ""}
              onChange={(event) => onNoteChange(event.target.value)}
              className="mt-1 min-h-16 w-full resize-none bg-transparent text-sm normal-case tracking-normal text-charcoal-900 outline-none placeholder:text-charcoal-500/70"
              placeholder="Bought by mum, hospital bag, Shopee link..."
            />
          </label>

          <div className="mt-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-oatmeal-200">
              <div
                className="h-full rounded-full bg-sage-300 transition-all duration-500"
                style={{ width: `${Math.min(100, (item.owned / item.desired) * 100)}%` }}
              />
            </div>
          </div>

          {!complete && (
            <button
              onClick={onRemoveWishlist}
              className="mt-3 w-full rounded-full border border-sage-200 bg-oatmeal-50 px-3 py-2 text-sm text-charcoal-500 transition hover:border-clay hover:text-clay"
            >
              {item.owned === 0 ? "Remove wishlist item" : "Remove from wishlist"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuantityField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl border border-oatmeal-200 bg-rice/60 px-3 py-2 text-xs uppercase tracking-[0.14em] text-sage-500">
      {label}
      <input
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full bg-transparent text-base font-semibold tracking-normal text-charcoal-900 outline-none"
      />
    </label>
  );
}

function Thumbnail({ item }: { item: BabyItem }) {
  if (item.imageUrl) {
    return (
      <img
        src={item.imageUrl}
        alt=""
        className="h-16 w-16 rounded-[1.25rem] border border-white object-cover shadow-sm"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }

  return (
    <div className="paper-grain grid h-16 w-16 shrink-0 place-items-center rounded-[1.25rem] border border-white shadow-sm">
      <span className="h-5 w-5 rounded-full border border-sage-300 bg-sage-100/60" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-charcoal-700">
      {label}
      {children}
    </label>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-oatmeal-200 px-4 py-3 text-sm text-charcoal-500">{text}</p>;
}
