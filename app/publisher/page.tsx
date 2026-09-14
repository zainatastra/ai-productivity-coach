"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  UserRound,
  Users,
  Video,
  Newspaper,
  X,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Plus,
  Save,
  Globe2,
  Mail,
  Phone,
  MapPin,
  Tags,
  PencilLine,
  ImagePlus,
  UploadCloud,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CircleCheck,
  Clock3,
  Ban,
  RotateCcw,
  EyeOff,
  Bold,
  Italic,
  Underline,
  Pilcrow,
  Quote,
  List,
  ListOrdered,
  ChevronDown,
  MessageSquareText,
} from "lucide-react";
import { publisherApp } from "@/services/firebase";
import { API_BASE_URL } from "@/services/api";
import { upload } from "@vercel/blob/client";

type PublisherMenu =
  | "overview"
  | "company"
  | "about"
  | "posts"
  | "whitepapers"
  | "products"
  | "contacts"
  | "calendar"
  | "webinars"
  | "events"
  | "submit";

type AccessInfo = {
  authenticated: boolean;
  uid: string;
  email: string;
  role: string;
  status: string;
};

type PublisherCompany = {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  websiteUrl?: string;
  email?: string;
  phone?: string;
  address?: string;
  categories?: string[];
  logoUrl?: string;
  bannerUrl?: string;
  status: string;
  moderationState: string;
  revisionNote?: string;
  rejectionNote?: string;
  reviewNote?: string;
  unpublishNote?: string;
  approvedVersion?: number;
  submittedAt?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt?: string;
};

const PAGE_TITLES: Record<PublisherMenu, string> = {
  overview: "Overview",
  company: "Company Profile",
  about: "About",
  posts: "Posts",
  whitepapers: "Whitepapers",
  products: "Products",
  contacts: "Contacts",
  calendar: "Calendar",
  webinars: "Webinars",
  events: "Events",
  submit: "Preview & Submit",
};

const PUBLISHER_SESSION_SECONDS = 60 * 60;

const COMPANY_CATEGORY_OPTIONS = [
  "Community",
  "Data management",
  "ERP provider",
  "Event",
  "IT Provider",
  "Marketing service provider",
  "Publisher",
  "Security Provider",
  "Software Provider",
] as const;

const normalizeSelectedCategories = (value: string) => {
  const selected = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return COMPANY_CATEGORY_OPTIONS.filter((option) =>
    selected.some((item) => item.toLowerCase() === option.toLowerCase())
  );
};

const formatSessionCountdown = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};


const getSafeVideoEmbedUrl = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    const pathParts = cleanPath.split("/").filter(Boolean);

    const safeId = (candidate: string | undefined) =>
      candidate && /^[a-zA-Z0-9_-]+$/.test(candidate) ? candidate : "";

    // YouTube
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      let id = "";

      if (pathParts[0] === "watch") {
        id = safeId(parsed.searchParams.get("v") || undefined);
      } else if (["embed", "shorts", "live"].includes(pathParts[0] || "")) {
        id = safeId(pathParts[1]);
      }

      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }

    if (host === "youtu.be") {
      const id = safeId(pathParts[0]);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }

    // Vimeo
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = pathParts.find((part) => /^\d+$/.test(part)) || "";
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }

    // Loom
    if (host === "loom.com") {
      const markerIndex = pathParts.findIndex((part) =>
        ["share", "embed"].includes(part)
      );
      const id = markerIndex >= 0 ? safeId(pathParts[markerIndex + 1]) : "";
      return id ? `https://www.loom.com/embed/${id}` : "";
    }

    // Dailymotion
    if (host === "dailymotion.com") {
      const markerIndex = pathParts.findIndex((part) => part === "video");
      const id = markerIndex >= 0 ? safeId(pathParts[markerIndex + 1]) : "";
      return id ? `https://www.dailymotion.com/embed/video/${id}` : "";
    }

    if (host === "dai.ly") {
      const id = safeId(pathParts[0]);
      return id ? `https://www.dailymotion.com/embed/video/${id}` : "";
    }

    // Wistia
    if (
      host === "wistia.com" ||
      host.endsWith(".wistia.com") ||
      host === "fast.wistia.net"
    ) {
      const mediaIndex = pathParts.findIndex((part) => part === "medias");
      const iframeIndex = pathParts.findIndex((part) => part === "iframe");
      const id =
        mediaIndex >= 0
          ? safeId(pathParts[mediaIndex + 1])
          : iframeIndex >= 0
            ? safeId(pathParts[iframeIndex + 1])
            : "";

      return id ? `https://fast.wistia.net/embed/iframe/${id}` : "";
    }

    return "";
  } catch {
    return "";
  }
};


type ResourceMenu =
  | "posts"
  | "whitepapers"
  | "products"
  | "contacts"
  | "calendar"
  | "webinars"
  | "events";

type FoundationItem = {
  id: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type PostGalleryMedia = {
  url: string;
  contentType?: string;
  size?: number;
  uploadedAt?: string;
};

type WhitepaperResponse = {
  id: string;
  whitepaperId?: string;
  whitepaperTitle?: string;
  providerSlug?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  message?: string;
  consentAccepted?: boolean;
  submittedAt?: string;
};

type WebinarResponse = {
  id: string;
  webinarId?: string;
  webinarTitle?: string;
  providerSlug?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  country?: string;
  company?: string;
  message?: string;
  consentAccepted?: boolean;
  submittedAt?: string;
};

type FoundationField = {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "email" | "url" | "date" | "time" | "datetime-local" | "textarea" | "richtext";
  required?: boolean;
  full?: boolean;
  maxLength?: number;
};

const RESOURCE_CONFIG: Record<
  ResourceMenu,
  {
    endpoint: string;
    title: string;
    singular: string;
    intro: string;
    primaryKey: string;
    fields: FoundationField[];
    media?: {
      label: string;
      accept: string;
      urlField: string;
      slot: string;
      helper: string;
      maxMb: number;
    };
  }
> = {
  posts: {
    endpoint: "posts",
    title: "Posts",
    singular: "Post",
    intro: "Create editorial updates that will later appear on your approved company profile.",
    primaryKey: "title",
    fields: [
      { key: "title", label: "Post Title", placeholder: "Enter post title", required: true, full: true, maxLength: 180 },
      { key: "subHeading", label: "Sub-heading", placeholder: "Add a descriptive sub-heading for the article", full: true, maxLength: 320 },
      { key: "excerpt", label: "Excerpt", placeholder: "A short summary for cards and previews", type: "textarea", full: true, maxLength: 500 },
      { key: "body", label: "Content", placeholder: "Write the complete post content...", type: "richtext", full: true, maxLength: 60000 },
    ],
    media: {
      label: "Post Image",
      accept: "image/jpeg,image/png,image/webp",
      urlField: "imageUrl",
      slot: "image",
      helper: "JPG, PNG or WEBP · max 8 MB",
      maxMb: 8,
    },
  },
  whitepapers: {
    endpoint: "whitepapers",
    title: "Whitepapers",
    singular: "Whitepaper",
    intro: "Create long-form whitepaper content with a dedicated cover image.",
    primaryKey: "title",
    fields: [
      { key: "title", label: "Title", placeholder: "Enter whitepaper title", required: true, full: true, maxLength: 180 },
      { key: "content", label: "Content", placeholder: "Write the complete whitepaper content...", type: "richtext", full: true, maxLength: 60000 },
    ],
    media: {
      label: "Whitepaper Image",
      accept: "image/jpeg,image/png,image/webp",
      urlField: "imageUrl",
      slot: "image",
      helper: "JPG, PNG or WEBP · max 8 MB",
      maxMb: 8,
    },
  },
  products: {
    endpoint: "products",
    title: "Products",
    singular: "Product",
    intro: "Create a structured product entry for the public product table.",
    primaryKey: "name",
    fields: [
      { key: "name", label: "Product", placeholder: "Enter product name", required: true, full: true, maxLength: 180 },
      { key: "category", label: "Category", placeholder: "Enter product category", required: true, full: true, maxLength: 120 },
      { key: "shortDescription", label: "Brief Description", placeholder: "Write a concise product description...", type: "textarea", required: true, full: true, maxLength: 1200 },
    ],
  },
  contacts: {
    endpoint: "contacts",
    title: "Contacts",
    singular: "Contact",
    intro: "Add the people visitors can contact from your company profile.",
    primaryKey: "fullName",
    fields: [
      { key: "fullName", label: "Full Name", placeholder: "Contact person name", required: true, maxLength: 160 },
      { key: "jobTitle", label: "Job Title", placeholder: "Position / role", maxLength: 160 },
      { key: "email", label: "Email", placeholder: "name@company.com", type: "email" },
      { key: "phone", label: "Phone", placeholder: "+49 ...", maxLength: 50 },
      { key: "linkedInUrl", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/...", type: "url", full: true },
    ],
    media: {
      label: "Contact Photo",
      accept: "image/jpeg,image/png,image/webp",
      urlField: "photoUrl",
      slot: "photo",
      helper: "JPG, PNG or WEBP · max 5 MB",
      maxMb: 5,
    },
  },
  calendar: {
    endpoint: "appointments",
    title: "Calendar & Appointments",
    singular: "Appointment",
    intro: "Prepare appointment options, meetings and bookable company sessions.",
    primaryKey: "title",
    fields: [
      { key: "title", label: "Appointment Title", placeholder: "e.g. Product Consultation", required: true, full: true, maxLength: 180 },
      { key: "startAt", label: "Start", placeholder: "", type: "datetime-local" },
      { key: "endAt", label: "End", placeholder: "", type: "datetime-local" },
      { key: "location", label: "Location", placeholder: "Online / office / venue", maxLength: 250 },
      { key: "bookingUrl", label: "Booking URL", placeholder: "https://...", type: "url" },
      { key: "notes", label: "Notes", placeholder: "Booking instructions or additional information...", type: "textarea", full: true, maxLength: 2000 },
    ],
  },
  webinars: {
    endpoint: "webinars",
    title: "Webinars",
    singular: "Webinar",
    intro: "Create a webinar landing experience with editorial content and speaker details.",
    primaryKey: "title",
    fields: [
      { key: "title", label: "Title", placeholder: "Enter webinar title", required: true, full: true, maxLength: 180 },
      { key: "subTitle", label: "Sub-Title", placeholder: "Add a short webinar sub-title", required: true, full: true, maxLength: 320 },
      { key: "content", label: "Content", placeholder: "Write the complete webinar content...", type: "richtext", required: true, full: true, maxLength: 60000 },
      { key: "speakerName", label: "Speaker Name", placeholder: "Enter speaker name", required: true, full: true, maxLength: 180 },
    ],
  },
  events: {
    endpoint: "events",
    title: "Events",
    singular: "Event",
    intro: "Create company event entries with a clear schedule, location, image and destination.",
    primaryKey: "title",
    fields: [
      { key: "title", label: "Event Title", placeholder: "Enter event title", required: true, full: true, maxLength: 180 },
      { key: "startDate", label: "Start Date", placeholder: "", type: "date", required: true },
      { key: "startTime", label: "Start Time", placeholder: "", type: "time", required: true },
      { key: "endDate", label: "End Date", placeholder: "", type: "date", required: true },
      { key: "endTime", label: "End Time", placeholder: "", type: "time", required: true },
      { key: "location", label: "Location", placeholder: "City, venue or online", required: true, full: true, maxLength: 250 },
      { key: "eventUrl", label: "Event URL", placeholder: "Optional · https://...", type: "url", full: true },
      { key: "summary", label: "Summary", placeholder: "Describe the event...", type: "textarea", full: true, maxLength: 3000 },
    ],
    media: {
      label: "Event Image",
      accept: "image/jpeg,image/png,image/webp",
      urlField: "imageUrl",
      slot: "image",
      helper: "JPG, PNG or WEBP · max 8 MB",
      maxMb: 8,
    },
  },
};

const EMPTY_RESOURCE_ITEMS: Record<ResourceMenu, FoundationItem[]> = {
  posts: [],
  whitepapers: [],
  products: [],
  contacts: [],
  calendar: [],
  webinars: [],
  events: [],
};


function PostRichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
  onUploadImage,
  maxImages = 15,
  allowImages = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  onUploadImage?: (
    file: File,
    onProgress?: (percentage: number) => void
  ) => Promise<string>;
  maxImages?: number;
  allowImages?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [imageError, setImageError] = useState("");
  const [draggingImage, setDraggingImage] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (editor.innerHTML !== value) {
      editor.innerHTML = value || "";
    }
  }, [value]);

  const rangeBelongsToEditor = (range: Range | null) => {
    const editor = editorRef.current;
    if (!editor || !range) return false;

    const container =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;

    return Boolean(container && editor.contains(container));
  };

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (rangeBelongsToEditor(range)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const getFallbackRange = () => {
    const editor = editorRef.current;
    if (!editor) return null;

    if (savedRangeRef.current && rangeBelongsToEditor(savedRangeRef.current)) {
      return savedRangeRef.current.cloneRange();
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  };

  const getRangeFromPoint = (clientX: number, clientY: number) => {
    const editor = editorRef.current;
    if (!editor) return getFallbackRange();

    const documentWithCaret = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (
        x: number,
        y: number
      ) => { offsetNode: Node; offset: number } | null;
    };

    let range: Range | null = null;

    if (typeof documentWithCaret.caretRangeFromPoint === "function") {
      range = documentWithCaret.caretRangeFromPoint(clientX, clientY);
    } else if (typeof documentWithCaret.caretPositionFromPoint === "function") {
      const position = documentWithCaret.caretPositionFromPoint(clientX, clientY);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }

    return rangeBelongsToEditor(range) ? range : getFallbackRange();
  };

  const setCaretRange = (range: Range) => {
    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(range);
    savedRangeRef.current = range.cloneRange();
  };

  const countInlineImages = () =>
    editorRef.current?.querySelectorAll("img").length || 0;

  const insertImageAtRange = (url: string, sourceRange: Range | null) => {
    const editor = editorRef.current;
    if (!editor) return null;

    const range =
      sourceRange && rangeBelongsToEditor(sourceRange)
        ? sourceRange.cloneRange()
        : getFallbackRange();

    if (!range) return null;

    const image = document.createElement("img");
    image.src = url;
    image.alt = "Post content image";
    image.setAttribute("draggable", "true");

    range.deleteContents();
    range.insertNode(image);

    const nextRange = document.createRange();
    nextRange.setStartAfter(image);
    nextRange.collapse(true);
    setCaretRange(nextRange);

    onChange(editor.innerHTML);
    return nextRange;
  };

  const validateInlineImage = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return `${file.name}: use a JPG, PNG or WEBP image.`;
    }

    if (file.size > 8 * 1024 * 1024) {
      return `${file.name}: image must be 8 MB or smaller.`;
    }

    return "";
  };

  const uploadImagesAtRange = async (
    files: File[],
    targetRange: Range | null
  ) => {
    if (
      !allowImages ||
      !onUploadImage ||
      disabled ||
      imageUploading ||
      files.length === 0
    ) return;

    const remaining = Math.max(0, maxImages - countInlineImages());

    if (remaining === 0) {
      setImageError(`A maximum of ${maxImages} images is allowed inside post content.`);
      return;
    }

    if (files.length > remaining) {
      setImageError(
        `You can add ${remaining} more content image${remaining === 1 ? "" : "s"}.`
      );
      return;
    }

    for (const file of files) {
      const validationError = validateInlineImage(file);
      if (validationError) {
        setImageError(validationError);
        return;
      }
    }

    setImageError("");
    setImageUploading(true);
    setImageUploadProgress(0);

    let workingRange =
      targetRange && rangeBelongsToEditor(targetRange)
        ? targetRange.cloneRange()
        : getFallbackRange();

    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];

        const url = await onUploadImage(file, (percentage) => {
          const overall = Math.round(
            ((index + percentage / 100) / files.length) * 100
          );
          setImageUploadProgress(Math.max(0, Math.min(100, overall)));
        });

        workingRange = insertImageAtRange(url, workingRange);
      }

      setImageUploadProgress(100);
    } catch (error) {
      console.error("Post content image upload failed:", error);
      setImageError(
        error instanceof Error
          ? error.message
          : "Unable to upload the content image. Please try again."
      );
    } finally {
      setImageUploading(false);
      window.setTimeout(() => setImageUploadProgress(0), 450);
    }
  };

  const runCommand = (command: string, commandValue?: string) => {
    if (disabled || imageUploading) return;

    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    if (savedRangeRef.current && rangeBelongsToEditor(savedRangeRef.current)) {
      setCaretRange(savedRangeRef.current.cloneRange());
    }

    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, commandValue);

    rememberSelection();
    onChange(editor.innerHTML);
  };

  const formatBlock = (tag: "p" | "h1" | "h2" | "h3" | "blockquote") => {
    runCommand("formatBlock", `<${tag}>`);
  };

  const openImagePicker = () => {
    if (!allowImages || !onUploadImage || disabled || imageUploading) return;

    rememberSelection();

    if (countInlineImages() >= maxImages) {
      setImageError(`A maximum of ${maxImages} images is allowed inside post content.`);
      return;
    }

    imageInputRef.current?.click();
  };

  const hasDraggedFiles = (event: React.DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer.items || []).some(
      (item) => item.kind === "file"
    );

  return (
    <div
      className={`pub-rich-editor-shell ${disabled ? "disabled" : ""} ${
        draggingImage ? "dragging-image" : ""
      }`}
    >
      <div className="pub-rich-toolbar" aria-label="Post formatting toolbar">
        <div className="pub-rich-toolbar-group">
          <button
            type="button"
            className="pub-rich-tool"
            title="Bold"
            aria-label="Bold"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("bold")}
            disabled={disabled || imageUploading}
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            className="pub-rich-tool"
            title="Italic"
            aria-label="Italic"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("italic")}
            disabled={disabled || imageUploading}
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            className="pub-rich-tool"
            title="Underline"
            aria-label="Underline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("underline")}
            disabled={disabled || imageUploading}
          >
            <Underline size={14} />
          </button>
        </div>

        <span className="pub-rich-toolbar-divider" />

        <div className="pub-rich-toolbar-group text">
          <button
            type="button"
            className="pub-rich-tool text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => formatBlock("p")}
            disabled={disabled || imageUploading}
            title="Paragraph"
          >
            <Pilcrow size={13} />
            Paragraph
          </button>
          <button
            type="button"
            className="pub-rich-tool text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => formatBlock("h1")}
            disabled={disabled || imageUploading}
            title="Heading 1"
          >
            H1
          </button>
          <button
            type="button"
            className="pub-rich-tool text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => formatBlock("h2")}
            disabled={disabled || imageUploading}
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            className="pub-rich-tool text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => formatBlock("h3")}
            disabled={disabled || imageUploading}
            title="Heading 3"
          >
            H3
          </button>
          <button
            type="button"
            className="pub-rich-tool text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => formatBlock("blockquote")}
            disabled={disabled || imageUploading}
            title="Quote"
            aria-label="Quote"
          >
            <Quote size={13} />
            Quote
          </button>
          <button
            type="button"
            className="pub-rich-tool text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("insertUnorderedList")}
            disabled={disabled || imageUploading}
            title="Bulleted list"
            aria-label="Bulleted list"
          >
            <List size={13} />
            Bullets
          </button>
          <button
            type="button"
            className="pub-rich-tool text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand("insertOrderedList")}
            disabled={disabled || imageUploading}
            title="Numbered list"
            aria-label="Numbered list"
          >
            <ListOrdered size={13} />
            Numbered
          </button>
        </div>

        {allowImages && (
          <>
            <span className="pub-rich-toolbar-divider" />

            <div className="pub-rich-toolbar-group">
              <button
                type="button"
                className="pub-rich-tool text"
                onMouseDown={(event) => {
                  event.preventDefault();
                  rememberSelection();
                }}
                onClick={openImagePicker}
                disabled={disabled || imageUploading}
                title={`Insert image at cursor · max ${maxImages}`}
                aria-label="Insert image at cursor"
              >
                <ImagePlus size={14} />
                Image
              </button>

              <input
                ref={imageInputRef}
                className="pub-rich-image-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files || []);
                  event.currentTarget.value = "";
                  void uploadImagesAtRange(files, getFallbackRange());
                }}
                disabled={disabled || imageUploading}
              />
            </div>

            <div className="pub-rich-media-count">
              {countInlineImages()}/{maxImages}
            </div>
          </>
        )}
      </div>

      {imageUploading && (
        <div className="pub-rich-upload-progress" aria-live="polite">
          <div className="pub-media-progress-track">
            <div
              className="pub-media-progress-fill"
              style={{ width: `${imageUploadProgress}%` }}
            />
          </div>
          <span>{imageUploadProgress}%</span>
        </div>
      )}

      {imageError && (
        <div className="pub-rich-media-error">{imageError}</div>
      )}

      <div
        ref={editorRef}
        className="pub-rich-editor"
        contentEditable={!disabled && !imageUploading}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        role="textbox"
        aria-multiline="true"
        aria-disabled={disabled || imageUploading}
        onInput={(event) => {
          rememberSelection();
          onChange(event.currentTarget.innerHTML);
        }}
        onBlur={(event) => {
          rememberSelection();
          onChange(event.currentTarget.innerHTML);
        }}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onFocus={rememberSelection}
        onDragEnter={(event) => {
          if (!allowImages || !hasDraggedFiles(event)) return;
          event.preventDefault();
          setDraggingImage(true);
        }}
        onDragOver={(event) => {
          if (!allowImages || !hasDraggedFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDraggingImage(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setDraggingImage(false);
        }}
        onDrop={(event) => {
          if (!allowImages) return;

          const files = Array.from(event.dataTransfer.files || []).filter(
            (file) => file.type.startsWith("image/")
          );

          if (files.length === 0) {
            setDraggingImage(false);
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setDraggingImage(false);

          const range = getRangeFromPoint(event.clientX, event.clientY);
          void uploadImagesAtRange(files, range);
        }}
      />
    </div>
  );
}

export default function PublisherDashboard() {
  const auth = getAuth(publisherApp);
  const router = useRouter();

  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [sessionRemainingSeconds, setSessionRemainingSeconds] = useState(PUBLISHER_SESSION_SECONDS);
  const sessionExpiryHandledRef = useRef(false);
  const [activeMenu, setActiveMenu] = useState<PublisherMenu>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [companies, setCompanies] = useState<PublisherCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyCreating, setCompanyCreating] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [companyDetailsLoading, setCompanyDetailsLoading] = useState(false);
  const [companySaving, setCompanySaving] = useState(false);
  const [companySaveSuccess, setCompanySaveSuccess] = useState("");
  const [companyForm, setCompanyForm] = useState({
    name: "",
    shortDescription: "",
    websiteUrl: "",
    email: "",
    phone: "",
    address: "",
    categoriesText: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");
  const [logoMediaError, setLogoMediaError] = useState("");
  const [bannerMediaError, setBannerMediaError] = useState("");
  const [aboutForm, setAboutForm] = useState({
    headline: "",
    overview: "",
    mission: "",
    vision: "",
    foundedYear: "",
    employeeRange: "",
    headquarters: "",
    specialtiesText: "",
  });
  const [resourceItems, setResourceItems] =
    useState<Record<ResourceMenu, FoundationItem[]>>(EMPTY_RESOURCE_ITEMS);
  const [resourceForm, setResourceForm] = useState<Record<string, string>>({});
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState("");
  const [sectionSuccess, setSectionSuccess] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [companyMediaUploading, setCompanyMediaUploading] = useState<"logo" | "banner" | null>(null);
  const [resourceMediaFile, setResourceMediaFile] = useState<File | null>(null);
  const [resourceMediaUploading, setResourceMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [postBannerPreview, setPostBannerPreview] = useState("");
  const [whitepaperImagePreview, setWhitepaperImagePreview] = useState("");
  const [webinarBannerPreview, setWebinarBannerPreview] = useState("");
  const [webinarSpeakerImagePreview, setWebinarSpeakerImagePreview] = useState("");
  const [postGalleryMedia, setPostGalleryMedia] = useState<PostGalleryMedia[]>([]);
  const [postGalleryUploading, setPostGalleryUploading] = useState(false);
  const [postGalleryUploadProgress, setPostGalleryUploadProgress] = useState(0);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [whitepaperResponsesOpen, setWhitepaperResponsesOpen] = useState(false);
  const [whitepaperResponsesLoading, setWhitepaperResponsesLoading] = useState(false);
  const [whitepaperResponsesError, setWhitepaperResponsesError] = useState("");
  const [whitepaperResponses, setWhitepaperResponses] = useState<WhitepaperResponse[]>([]);
  const [whitepaperResponsesTitle, setWhitepaperResponsesTitle] = useState("");
  const [expandedWhitepaperResponseId, setExpandedWhitepaperResponseId] = useState<string | null>(null);
  const [webinarResponsesOpen, setWebinarResponsesOpen] = useState(false);
  const [webinarResponsesLoading, setWebinarResponsesLoading] = useState(false);
  const [webinarResponsesError, setWebinarResponsesError] = useState("");
  const [webinarResponses, setWebinarResponses] = useState<WebinarResponse[]>([]);
  const [webinarResponsesTitle, setWebinarResponsesTitle] = useState("");
  const [expandedWebinarResponseId, setExpandedWebinarResponseId] = useState<string | null>(null);
  const [productFeatures, setProductFeatures] = useState<string[]>([]);
  const [productFeatureDraft, setProductFeatureDraft] = useState("");

  const navItems = useMemo(
    () => [
      { key: "overview" as PublisherMenu, label: "Overview", Icon: LayoutDashboard },
      { key: "company" as PublisherMenu, label: "Company Profile", Icon: Building2 },
      { key: "about" as PublisherMenu, label: "About", Icon: FileText },
      { key: "posts" as PublisherMenu, label: "Posts", Icon: Newspaper },
      { key: "whitepapers" as PublisherMenu, label: "Whitepapers", Icon: FileText },
      { key: "products" as PublisherMenu, label: "Products", Icon: Package },
      { key: "contacts" as PublisherMenu, label: "Contacts", Icon: Users },
      { key: "calendar" as PublisherMenu, label: "Calendar", Icon: CalendarDays },
      { key: "webinars" as PublisherMenu, label: "Webinars", Icon: Video },
      { key: "events" as PublisherMenu, label: "Events", Icon: Sparkles },
      { key: "submit" as PublisherMenu, label: "Preview & Submit", Icon: Send },
    ],
    []
  );

  const publisherWorkflow: PublisherMenu[] = [
    "company",
    "about",
    "posts",
    "whitepapers",
    "products",
    "contacts",
    "calendar",
    "webinars",
    "events",
    "submit",
  ];

  const goToNextStep = (menu: PublisherMenu) => {
    const currentIndex = publisherWorkflow.indexOf(menu);
    if (currentIndex < 0) return;
    const nextMenu = publisherWorkflow[currentIndex + 1];
    if (nextMenu) goTo(nextMenu);
  };

  const resourceFormHasContent = (menu: ResourceMenu) =>
    RESOURCE_CONFIG[menu].fields.some(
      (field) => (resourceForm[field.key] || "").trim().length > 0
    ) ||
    (menu === "products" && productFeatures.length > 0) ||
    resourceMediaFile !== null ||
    editingResourceId !== null;

  const expirePublisherSession = async () => {
    if (sessionExpiryHandledRef.current) return;
    sessionExpiryHandledRef.current = true;

    try {
      window.sessionStorage.setItem("publisherSessionExpired", "1");
      await signOut(auth);
    } finally {
      router.replace("/publisher/login");
    }
  };

  const verifyPublisherAccess = async (user: import("firebase/auth").User) => {
    const token = await user.getIdToken();

    const res = await fetch(`${API_BASE_URL}/api/auth/access`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as AccessInfo;

    if (
      data?.authenticated === true &&
      data?.role === "publisher" &&
      data?.status === "active"
    ) {
      return data;
    }

    return null;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/publisher/login");
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult();
        const authTimeSeconds = Number(tokenResult.claims.auth_time || 0);
        const expiresAt = authTimeSeconds > 0
          ? (authTimeSeconds + PUBLISHER_SESSION_SECONDS) * 1000
          : 0;

        if (!expiresAt || Date.now() >= expiresAt) {
          await expirePublisherSession();
          return;
        }

        const verifiedAccess = await verifyPublisherAccess(user);

        if (!verifiedAccess) {
          await signOut(auth);
          router.replace("/publisher/login");
          return;
        }

        sessionExpiryHandledRef.current = false;
        setSessionExpiresAt(expiresAt);
        setSessionRemainingSeconds(
          Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
        );
        setAccess(verifiedAccess);
      } catch {
        await signOut(auth);
        router.replace("/publisher/login");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  useEffect(() => {
    if (!access || !sessionExpiresAt) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((sessionExpiresAt - Date.now()) / 1000)
      );

      setSessionRemainingSeconds(remaining);

      if (remaining <= 0) {
        void expirePublisherSession();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);
  }, [access, sessionExpiresAt]);

  const loadMyCompanies = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setCompaniesLoading(true);
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/company/mine`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        setCompanyError("Unable to load your company profile.");
        return;
      }

      const result = await res.json();
      setCompanies(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error("Company loading failed:", error);
      setCompanyError("Unable to load your company profile.");
    } finally {
      setCompaniesLoading(false);
    }
  };

  const loadCompanyDetails = async (companyId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setCompanyDetailsLoading(true);
      setCompanyError("");
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/company/${companyId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setCompanyError(payload?.message || "Unable to load company details.");
        return;
      }

      const company = payload as PublisherCompany;

      setCompanies((current) =>
        current.map((item) =>
          item.id === company.id ? { ...item, ...company } : item
        )
      );

      setCompanyForm({
        name: company.name || "",
        shortDescription: company.shortDescription || "",
        websiteUrl: company.websiteUrl || "",
        email: company.email || "",
        phone: company.phone || "",
        address: company.address || "",
        categoriesText: Array.isArray(company.categories)
          ? normalizeSelectedCategories(company.categories.join(", ")).join(", ")
          : "",
      });

      if (!logoFile) {
        setLogoPreview(company.logoUrl || "");
      }

      if (!bannerFile) {
        setBannerPreview(company.bannerUrl || "");
      }
    } catch (error) {
      console.error("Company details loading failed:", error);
      setCompanyError("Unable to load company details.");
    } finally {
      setCompanyDetailsLoading(false);
    }
  };

  const validateMediaFile = (
    file: File,
    kind: "logo" | "banner"
  ) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxBytes = 5 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      return "Use a JPG, PNG or WEBP image.";
    }

    if (file.size > maxBytes) {
      return "Image must be 5 MB or smaller.";
    }

    return "";
  };

  const handleMediaSelection = (
    file: File | null,
    kind: "logo" | "banner"
  ) => {
    if (!file) return;

    const error = validateMediaFile(file, kind);

    if (kind === "logo") {
      setLogoMediaError(error);
    } else {
      setBannerMediaError(error);
    }

    if (error) return;

    const objectUrl = URL.createObjectURL(file);

    if (kind === "logo") {
      if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      setLogoFile(file);
      setLogoPreview(objectUrl);
    } else {
      if (bannerPreview.startsWith("blob:")) URL.revokeObjectURL(bannerPreview);
      setBannerFile(file);
      setBannerPreview(objectUrl);
    }
  };

  const clearSelectedMedia = (kind: "logo" | "banner") => {
    const company = companies[0];

    if (kind === "logo") {
      if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      setLogoFile(null);
      setLogoPreview(company?.logoUrl || "");
      setLogoMediaError("");
    } else {
      if (bannerPreview.startsWith("blob:")) URL.revokeObjectURL(bannerPreview);
      setBannerFile(null);
      setBannerPreview(company?.bannerUrl || "");
      setBannerMediaError("");
    }
  };

  const handleMediaDrop = (
    event: React.DragEvent<HTMLLabelElement>,
    kind: "logo" | "banner"
  ) => {
    event.preventDefault();
    event.currentTarget.classList.remove("dragging");
    const file = event.dataTransfer.files?.[0] || null;
    handleMediaSelection(file, kind);
  };

  const getMediaErrorMessage = (
    error: unknown,
    fallback: string
  ) => {
    const message = error instanceof Error ? error.message : "";

    if (message === "Your publisher session has expired.") {
      return message;
    }

    if (message === "Unsupported media type.") {
      return "This file type is not supported.";
    }

    if (message === "The upload completed but could not be saved to your profile. Please try again.") {
      return message;
    }

    return fallback;
  };

  const getBlobExtension = (file: File) => {
    if (file.type === "image/jpeg") return "jpg";
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "application/pdf") return "pdf";
    return "";
  };

  const uploadProviderMedia = async ({
    companyId,
    file,
    scope,
    slot,
    resourceType = "",
    resourceId = "",
    onProgress,
  }: {
    companyId: string;
    file: File;
    scope: "company" | "resource";
    slot: string;
    resourceType?: string;
    resourceId?: string;
    onProgress?: (percentage: number) => void;
  }) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Your publisher session has expired.");

    const extension = getBlobExtension(file);
    if (!extension) throw new Error("Unsupported media type.");

    const randomId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replaceAll("-", "")
        : `${Date.now()}${Math.random().toString(16).slice(2)}`;

    const pathname =
      scope === "company"
        ? `providers/${companyId}/company/${slot}/${randomId}.${extension}`
        : `providers/${companyId}/${resourceType}/${resourceId}/${slot}/${randomId}.${extension}`;

    const firebaseToken = await user.getIdToken();

    setMediaUploadProgress(0);

    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/provider-media/upload",
      clientPayload: JSON.stringify({
        firebaseToken,
        companyId,
        scope,
        slot,
        resourceType,
        resourceId,
        pathname,
        contentType: file.type,
        size: file.size,
      }),
      contentType: file.type,
      multipart: file.size > 4 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => {
        const rounded = Math.round(percentage);
        if (onProgress) {
          onProgress(rounded);
        } else {
          setMediaUploadProgress(rounded);
        }
      },
    });

    const commit = await fetch(
      `${API_BASE_URL}/api/company/${companyId}/media/commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firebaseToken}`,
        },
        body: JSON.stringify({
          scope,
          slot,
          resourceType,
          resourceId,
          pathname: blob.pathname,
          url: blob.url,
          contentType: file.type,
          size: file.size,
        }),
      }
    );

    const commitBody = await commit.json().catch(() => null);

    if (!commit.ok) {
      throw new Error(
        commitBody?.message ||
          "The upload completed but could not be saved to your profile. Please try again."
      );
    }

    return {
      url: commitBody?.url || blob.url,
      pathname: commitBody?.pathname || blob.pathname,
    };
  };

  const uploadCompanyMedia = async (kind: "logo" | "banner") => {
    const company = companies[0];
    const file = kind === "logo" ? logoFile : bannerFile;
    if (!company || !file) return;

    if (company.moderationState === "pending_review") {
      setCompanyError("Editing is locked while this profile is pending admin review.");
      return;
    }

    try {
      setCompanyMediaUploading(kind);
      setCompanyError("");
      setCompanySaveSuccess("");

      const result = await uploadProviderMedia({
        companyId: company.id,
        file,
        scope: "company",
        slot: kind,
      });

      if (kind === "logo") {
        if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
        setLogoFile(null);
        setLogoPreview(result.url);
      } else {
        if (bannerPreview.startsWith("blob:")) URL.revokeObjectURL(bannerPreview);
        setBannerFile(null);
        setBannerPreview(result.url);
      }

      await loadCompanyDetails(company.id);
      setCompanySaveSuccess(`${kind === "logo" ? "Logo" : "Banner"} uploaded successfully.`);
      window.setTimeout(() => setCompanySaveSuccess(""), 2800);
    } catch (error) {
      console.error(`Company ${kind} upload failed:`, error);
      setCompanyError(
        getMediaErrorMessage(
          error,
          `Unable to upload the company ${kind}. Check the file and your connection, then try again.`
        )
      );
    } finally {
      setCompanyMediaUploading(null);
      setMediaUploadProgress(0);
    }
  };

  const removeCompanyMedia = async (kind: "logo" | "banner") => {
    const company = companies[0];
    const user = auth.currentUser;
    if (!company || !user) return;

    if (company.moderationState === "pending_review") {
      setCompanyError("Editing is locked while this profile is pending admin review.");
      return;
    }

    if (!window.confirm(`Remove the company ${kind}?`)) return;

    try {
      setCompanyMediaUploading(kind);
      setCompanyError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/company/${company.id}/media/company/${kind}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setCompanyError(
          res.status === 401
            ? "Your publisher session has expired."
            : res.status === 403
              ? "You do not have permission to change this media."
              : `Unable to remove the company ${kind}. Please try again.`
        );
        return;
      }

      if (kind === "logo") {
        setLogoFile(null);
        setLogoPreview("");
      } else {
        setBannerFile(null);
        setBannerPreview("");
      }

      await loadCompanyDetails(company.id);
      setCompanySaveSuccess(`${kind === "logo" ? "Logo" : "Banner"} removed.`);
      window.setTimeout(() => setCompanySaveSuccess(""), 2400);
    } finally {
      setCompanyMediaUploading(null);
    }
  };

  const uploadResourceMedia = async (
    menu: ResourceMenu,
    resourceId: string,
    file: File
  ) => {
    const company = companies[0];
    const config = RESOURCE_CONFIG[menu];

    if (!company || !config.media) return false;

    if (file.size > config.media.maxMb * 1024 * 1024) {
      setSectionError(`File must be ${config.media.maxMb} MB or smaller.`);
      return false;
    }

    try {
      setResourceMediaUploading(true);

      await uploadProviderMedia({
        companyId: company.id,
        file,
        scope: "resource",
        slot: config.media.slot,
        resourceType: config.endpoint,
        resourceId,
      });

      return true;
    } catch (error) {
      console.error("Resource media upload failed:", error);
      setSectionError(
        getMediaErrorMessage(
          error,
          `Unable to upload ${config.media.label.toLowerCase()}. Check the file and your connection, then try again.`
        )
      );
      return false;
    } finally {
      setResourceMediaUploading(false);
      setMediaUploadProgress(0);
    }
  };

  const removeResourceMedia = async (
    menu: ResourceMenu,
    resourceId: string
  ) => {
    const company = companies[0];
    const user = auth.currentUser;
    const config = RESOURCE_CONFIG[menu];

    if (!company || !user || !config.media) return;

    if (company.moderationState === "pending_review") {
      setSectionError("Editing is locked while this profile is pending admin review.");
      return;
    }

    if (!window.confirm(`Remove the attached ${config.media.label.toLowerCase()}?`)) return;

    try {
      setResourceMediaUploading(true);
      setSectionError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/company/${company.id}/media/${config.endpoint}/${resourceId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setSectionError(
          res.status === 401
            ? "Your publisher session has expired."
            : res.status === 403
              ? "You do not have permission to change this media."
              : "Unable to remove the attached media. Please try again."
        );
        return;
      }

      await loadFoundationSection(menu);
      await loadCompanyDetails(company.id);
      setSectionSuccess("Attached media removed.");
      window.setTimeout(() => setSectionSuccess(""), 2200);
    } finally {
      setResourceMediaUploading(false);
    }
  };

  const toggleCompanyCategory = (category: string) => {
    if (editingLocked || companySaving) return;

    setCompanyForm((current) => {
      const selected = normalizeSelectedCategories(current.categoriesText);
      const exists = selected.some(
        (item) => item.toLowerCase() === category.toLowerCase()
      );

      const next = exists
        ? selected.filter((item) => item.toLowerCase() !== category.toLowerCase())
        : [...selected, category];

      return {
        ...current,
        categoriesText: next.join(", "),
      };
    });
  };

  const handleSaveCompanyDetails = async (): Promise<boolean> => {
    setCompanyError("");
    setCompanySaveSuccess("");

    const company = companies[0];
    if (!company) return false;

    if (company.moderationState === "pending_review") {
      setCompanyError("Editing is locked while this profile is pending admin review.");
      return false;
    }

    const name = companyForm.name.trim();
    const shortDescription = companyForm.shortDescription.trim();
    const websiteUrl = companyForm.websiteUrl.trim();
    const email = companyForm.email.trim().toLowerCase();
    const phone = companyForm.phone.trim();
    const address = companyForm.address.trim();

    const categories = normalizeSelectedCategories(companyForm.categoriesText);

    if (!name) {
      setCompanyError("Company name is required.");
      return false;
    }

    if (name.length > 160) {
      setCompanyError("Company name must be 160 characters or fewer.");
      return false;
    }

    if (shortDescription.length > 500) {
      setCompanyError("Short description must be 500 characters or fewer.");
      return false;
    }

    if (websiteUrl && !/^https?:\/\/.+/i.test(websiteUrl)) {
      setCompanyError("Website URL must begin with http:// or https://.");
      return false;
    }

    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setCompanyError("Enter a valid company email address.");
      return false;
    }

    const user = auth.currentUser;
    if (!user) {
      setCompanyError("Your publisher session has expired.");
      return false;
    }

    try {
      setCompanySaving(true);
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/company/${company.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          shortDescription,
          websiteUrl,
          email,
          phone,
          address,
          categories,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setCompanyError(payload?.message || "Unable to save company details.");
        return false;
      }

      const updated = payload as PublisherCompany;

      setCompanies((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        )
      );

      setCompanyForm({
        name: updated.name || "",
        shortDescription: updated.shortDescription || "",
        websiteUrl: updated.websiteUrl || "",
        email: updated.email || "",
        phone: updated.phone || "",
        address: updated.address || "",
        categoriesText: Array.isArray(updated.categories)
          ? normalizeSelectedCategories(updated.categories.join(", ")).join(", ")
          : "",
      });

      setCompanySaveSuccess("Draft saved successfully.");
      window.setTimeout(() => setCompanySaveSuccess(""), 2800);
      return true;
    } catch (error) {
      console.error("Company save failed:", error);
      setCompanyError("Unable to save company details. Please try again.");
      return false;
    } finally {
      setCompanySaving(false);
    }
  };

  const handleCreateCompany = async () => {
    setCompanyError("");
    const name = companyName.trim();

    if (!name) {
      setCompanyError("Enter your company name.");
      return;
    }

    if (name.length > 160) {
      setCompanyError("Company name must be 160 characters or fewer.");
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      setCompanyError("Your publisher session has expired.");
      return;
    }

    try {
      setCompanyCreating(true);
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/company`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 409) {
          setCompanyError(payload?.message || "A company with this name already exists.");
        } else {
          setCompanyError(payload?.message || "Unable to create your company.");
        }
        return;
      }

      setCompanyName("");
      await loadMyCompanies();
    } catch (error) {
      console.error("Company creation failed:", error);
      setCompanyError("Unable to create your company. Please try again.");
    } finally {
      setCompanyCreating(false);
    }
  };

  useEffect(() => {
    if (access) {
      loadMyCompanies();
    }
  }, [access]);

  useEffect(() => {
    if (access && companies.length > 0) {
      loadCompanyDetails(companies[0].id);
    }
  }, [access, companies.length]);


  useEffect(() => {
    if (!access || companies.length === 0) return;

    if (activeMenu === "about" || isResourceMenu(activeMenu)) {
      if (isResourceMenu(activeMenu)) {
        setEditingResourceId(null);
        setResourceForm(emptyFormFor(activeMenu));
      }
      loadFoundationSection(activeMenu);
    }

    if (activeMenu === "submit") {
      loadPreviewFoundation();
    }
  }, [activeMenu, access, companies.length]);

  useEffect(() => {
    return () => {
      if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  useEffect(() => {
    return () => {
      if (bannerPreview.startsWith("blob:")) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  const isResourceMenu = (menu: PublisherMenu): menu is ResourceMenu =>
    ["posts", "whitepapers", "products", "contacts", "calendar", "webinars", "events"].includes(menu);

  const emptyFormFor = (menu: ResourceMenu) =>
    RESOURCE_CONFIG[menu].fields.reduce<Record<string, string>>((form, field) => {
      form[field.key] = "";
      return form;
    }, {});

  const readPostGalleryMedia = (value: unknown): PostGalleryMedia[] => {
    if (!Array.isArray(value)) return [];

    const galleryMedia: PostGalleryMedia[] = [];

    for (const item of value) {
      if (!item || typeof item !== "object") continue;

      const media = item as Record<string, unknown>;
      const url = typeof media.url === "string" ? media.url : "";

      if (!url) continue;

      const normalized: PostGalleryMedia = { url };

      if (typeof media.contentType === "string") {
        normalized.contentType = media.contentType;
      }

      if (typeof media.size === "number") {
        normalized.size = media.size;
      }

      if (typeof media.uploadedAt === "string") {
        normalized.uploadedAt = media.uploadedAt;
      }

      galleryMedia.push(normalized);

      if (galleryMedia.length >= 10) break;
    }

    return galleryMedia;
  };

  const addProductFeature = () => {
    const value = productFeatureDraft.trim();

    if (!value) return;

    if (value.length > 100) {
      setSectionError("Each product feature must be 100 characters or fewer.");
      return;
    }

    if (productFeatures.length >= 30) {
      setSectionError("A maximum of 30 product features is allowed.");
      return;
    }

    if (
      productFeatures.some(
        (feature) => feature.toLowerCase() === value.toLowerCase()
      )
    ) {
      setProductFeatureDraft("");
      return;
    }

    setProductFeatures((current) => [...current, value]);
    setProductFeatureDraft("");
    setSectionError("");
  };

  const removeProductFeature = (index: number) => {
    if (editingLocked || sectionSaving) return;

    setProductFeatures((current) =>
      current.filter((_, featureIndex) => featureIndex !== index)
    );
  };

  const openNewResourceModal = (menu: ResourceMenu) => {
    setEditingResourceId(null);
    setProductFeatures([]);
    setProductFeatureDraft("");
    setResourceMediaFile(null);
    setPostBannerPreview("");
    setWhitepaperImagePreview("");
    setWebinarBannerPreview("");
    setWebinarSpeakerImagePreview("");
    setPostGalleryMedia([]);
    setPostGalleryUploadProgress(0);
    setResourceForm(emptyFormFor(menu));
    setSectionError("");
    setSectionSuccess("");
    setResourceModalOpen(true);
  };

  const closeResourceModal = () => {
    if (sectionSaving || resourceMediaUploading || postGalleryUploading) return;
    setProductFeatures([]);
    setProductFeatureDraft("");
    if (isResourceMenu(activeMenu)) {
      setEditingResourceId(null);
      setResourceMediaFile(null);
      setPostBannerPreview("");
      setWhitepaperImagePreview("");
      setWebinarBannerPreview("");
      setWebinarSpeakerImagePreview("");
      setPostGalleryMedia([]);
      setPostGalleryUploadProgress(0);
      setResourceForm(emptyFormFor(activeMenu));
    }
    setSectionError("");
    setResourceModalOpen(false);
  };

  const formatResourceDate = (value: unknown) => {
    if (typeof value !== "string" || !value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const loadFoundationSection = async (menu: PublisherMenu) => {
    const company = companies[0];
    const user = auth.currentUser;

    if (!company || !user) return;

    setSectionError("");
    setSectionSuccess("");

    try {
      setSectionLoading(true);
      const token = await user.getIdToken();

      if (menu === "about") {
        const res = await fetch(`${API_BASE_URL}/api/company/${company.id}/about`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          setSectionError(payload?.message || "Unable to load About details.");
          return;
        }

        setAboutForm({
          headline: payload?.headline || "",
          overview: payload?.overview || "",
          mission: payload?.mission || "",
          vision: payload?.vision || "",
          foundedYear: payload?.foundedYear || "",
          employeeRange: payload?.employeeRange || "",
          headquarters: payload?.headquarters || "",
          specialtiesText: Array.isArray(payload?.specialties)
            ? payload.specialties.join(", ")
            : "",
        });

        return;
      }

      if (isResourceMenu(menu)) {
        const config = RESOURCE_CONFIG[menu];
        const res = await fetch(
          `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          setSectionError(payload?.message || `Unable to load ${config.title.toLowerCase()}.`);
          return;
        }

        setResourceItems((current) => ({
          ...current,
          [menu]: Array.isArray(payload) ? payload : [],
        }));
      }
    } catch (error) {
      console.error("Publisher section loading failed:", error);
      setSectionError("Unable to load this section.");
    } finally {
      setSectionLoading(false);
    }
  };

  const saveAbout = async (): Promise<boolean> => {
    const company = companies[0];
    const user = auth.currentUser;

    if (!company || !user) return false;

    if (company.moderationState === "pending_review") {
      setSectionError("Editing is locked while this profile is pending admin review.");
      return false;
    }

    setSectionError("");
    setSectionSuccess("");

    const specialties = aboutForm.specialtiesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter(
        (item, index, self) =>
          self.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index
      );

    if (aboutForm.headline.length > 180) {
      setSectionError("Headline must be 180 characters or fewer.");
      return false;
    }

    if (specialties.length > 20) {
      setSectionError("A maximum of 20 specialties is allowed.");
      return false;
    }

    try {
      setSectionSaving(true);
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/company/${company.id}/about`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          headline: aboutForm.headline.trim(),
          overview: aboutForm.overview.trim(),
          mission: aboutForm.mission.trim(),
          vision: aboutForm.vision.trim(),
          foundedYear: aboutForm.foundedYear.trim(),
          employeeRange: aboutForm.employeeRange.trim(),
          headquarters: aboutForm.headquarters.trim(),
          specialties,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setSectionError(payload?.message || "Unable to save About details.");
        return false;
      }

      await loadCompanyDetails(company.id);
      setSectionSuccess("About draft saved.");
      window.setTimeout(() => setSectionSuccess(""), 2600);
      return true;
    } catch (error) {
      console.error("About save failed:", error);
      setSectionError("Unable to save About details.");
      return false;
    } finally {
      setSectionSaving(false);
    }
  };

  const validatePostImageFile = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return "Use a JPG, PNG or WEBP image.";
    }

    if (file.size > 8 * 1024 * 1024) {
      return "Image must be 8 MB or smaller.";
    }

    return "";
  };

  const ensurePostDraftForMedia = async (): Promise<string | null> => {
    if (editingResourceId) return editingResourceId;

    const company = companies[0];
    const user = auth.currentUser;
    if (!company || !user) return null;

    const title = (resourceForm.title || "").trim();

    if (!title) {
      setSectionError("Enter the Post Title before uploading post media.");
      return null;
    }

    const config = RESOURCE_CONFIG.posts;
    const payload = config.fields.reduce<Record<string, string>>((result, field) => {
      result[field.key] = resourceForm[field.key]?.trim() || "";
      return result;
    }, {});

    payload.videoEmbedUrl = (resourceForm.videoEmbedUrl || "").trim();

    try {
      setSectionSaving(true);
      setSectionError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json().catch(() => null);

      if (!res.ok) {
        setSectionError(result?.message || "Unable to prepare the post for media upload.");
        return null;
      }

      const resourceId = String(result?.id || "");
      if (!resourceId) {
        setSectionError("The post was created but its media target could not be resolved.");
        return null;
      }

      setEditingResourceId(resourceId);
      return resourceId;
    } catch (error) {
      console.error("Post media draft creation failed:", error);
      setSectionError("Unable to prepare the post for media upload.");
      return null;
    } finally {
      setSectionSaving(false);
    }
  };


  const ensureWhitepaperDraftForMedia = async (): Promise<string | null> => {
    if (editingResourceId) return editingResourceId;

    const company = companies[0];
    const user = auth.currentUser;
    if (!company || !user) return null;

    const title = (resourceForm.title || "").trim();

    if (!title) {
      setSectionError("Enter the Whitepaper Title before uploading the whitepaper image.");
      return null;
    }

    const config = RESOURCE_CONFIG.whitepapers;
    const payload = config.fields.reduce<Record<string, string>>((result, field) => {
      result[field.key] = resourceForm[field.key]?.trim() || "";
      return result;
    }, {});

    try {
      setSectionSaving(true);
      setSectionError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json().catch(() => null);

      if (!res.ok) {
        setSectionError(
          result?.message || "Unable to prepare the whitepaper for image upload."
        );
        return null;
      }

      const resourceId = String(result?.id || "");
      if (!resourceId) {
        setSectionError(
          "The whitepaper was created but its image target could not be resolved."
        );
        return null;
      }

      setEditingResourceId(resourceId);
      return resourceId;
    } catch (error) {
      console.error("Whitepaper media draft creation failed:", error);
      setSectionError("Unable to prepare the whitepaper for image upload.");
      return null;
    } finally {
      setSectionSaving(false);
    }
  };

  const ensureWebinarDraftForMedia = async (): Promise<string | null> => {
    if (editingResourceId) return editingResourceId;

    const company = companies[0];
    const user = auth.currentUser;
    if (!company || !user) return null;

    const title = (resourceForm.title || "").trim();

    if (!title) {
      setSectionError("Enter the Webinar Title before uploading webinar media.");
      return null;
    }

    const config = RESOURCE_CONFIG.webinars;
    const payload: Record<string, string | boolean> =
      config.fields.reduce<Record<string, string | boolean>>((result, field) => {
        result[field.key] = resourceForm[field.key]?.trim() || "";
        return result;
      }, {});

    // The backend will create an incomplete draft solely so the media commit
    // has a verified webinar resource to target. The final Add/Update Webinar
    // action still performs full required-field validation.
    payload.mediaDraft = true;

    try {
      setSectionSaving(true);
      setSectionError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json().catch(() => null);

      if (!res.ok) {
        const serverMessage =
          typeof result === "string"
            ? result
            : result?.message;

        setSectionError(
          serverMessage || "Unable to prepare the webinar for media upload."
        );
        return null;
      }

      const resourceId = String(result?.id || "");
      if (!resourceId) {
        setSectionError(
          "The webinar was created but its media target could not be resolved."
        );
        return null;
      }

      setEditingResourceId(resourceId);
      return resourceId;
    } catch (error) {
      console.error("Webinar media draft creation failed:", error);
      setSectionError("Unable to prepare the webinar for media upload.");
      return null;
    } finally {
      setSectionSaving(false);
    }
  };

  const handleWebinarMediaSelection = async (
    file: File | null,
    slot: "banner" | "speaker"
  ) => {
    if (!file || editingLocked || sectionSaving || resourceMediaUploading) return;

    const validationError = validatePostImageFile(file);
    if (validationError) {
      setSectionError(validationError);
      return;
    }

    const company = companies[0];
    if (!company) return;

    setSectionError("");

    const resourceId = await ensureWebinarDraftForMedia();
    if (!resourceId) return;

    try {
      setResourceMediaUploading(true);
      setMediaUploadProgress(0);

      const result = await uploadProviderMedia({
        companyId: company.id,
        file,
        scope: "resource",
        slot,
        resourceType: "webinars",
        resourceId,
      });

      if (slot === "banner") {
        setWebinarBannerPreview(result.url);
      } else {
        setWebinarSpeakerImagePreview(result.url);
      }

      await loadFoundationSection("webinars");
      await loadCompanyDetails(company.id);
      setSectionSuccess(
        slot === "banner"
          ? "Webinar banner uploaded automatically."
          : "Speaker image uploaded automatically."
      );
      window.setTimeout(() => setSectionSuccess(""), 2200);
    } catch (error) {
      console.error(`Webinar ${slot} upload failed:`, error);
      setSectionError(
        getMediaErrorMessage(
          error,
          slot === "banner"
            ? "Unable to upload the webinar banner. Please try again."
            : "Unable to upload the speaker image. Please try again."
        )
      );
    } finally {
      setResourceMediaUploading(false);
      setMediaUploadProgress(0);
    }
  };


  const handleWhitepaperImageSelection = async (file: File | null) => {
    if (!file || editingLocked || sectionSaving || resourceMediaUploading) return;

    const validationError = validatePostImageFile(file);
    if (validationError) {
      setSectionError(validationError);
      return;
    }

    const company = companies[0];
    if (!company) return;

    setResourceMediaFile(file);
    setSectionError("");

    const resourceId = await ensureWhitepaperDraftForMedia();
    if (!resourceId) {
      setResourceMediaFile(null);
      return;
    }

    try {
      setResourceMediaUploading(true);
      setMediaUploadProgress(0);

      const result = await uploadProviderMedia({
        companyId: company.id,
        file,
        scope: "resource",
        slot: "image",
        resourceType: "whitepapers",
        resourceId,
      });

      setWhitepaperImagePreview(result.url);
      setResourceMediaFile(null);
      await loadFoundationSection("whitepapers");
      await loadCompanyDetails(company.id);
      setSectionSuccess("Whitepaper image uploaded automatically.");
      window.setTimeout(() => setSectionSuccess(""), 2200);
    } catch (error) {
      console.error("Whitepaper image upload failed:", error);
      setSectionError(
        getMediaErrorMessage(
          error,
          "Unable to upload the whitepaper image. Check the image and your connection, then try again."
        )
      );
    } finally {
      setResourceMediaUploading(false);
      setMediaUploadProgress(0);
    }
  };

  const handlePostBannerSelection = async (file: File | null) => {
    if (!file || editingLocked || sectionSaving || resourceMediaUploading) return;

    const validationError = validatePostImageFile(file);
    if (validationError) {
      setSectionError(validationError);
      return;
    }

    const company = companies[0];
    if (!company) return;

    setResourceMediaFile(file);
    setSectionError("");

    const resourceId = await ensurePostDraftForMedia();
    if (!resourceId) {
      setResourceMediaFile(null);
      return;
    }

    try {
      setResourceMediaUploading(true);
      setMediaUploadProgress(0);

      const result = await uploadProviderMedia({
        companyId: company.id,
        file,
        scope: "resource",
        slot: "image",
        resourceType: "posts",
        resourceId,
      });

      setPostBannerPreview(result.url);
      setResourceMediaFile(null);
      await loadFoundationSection("posts");
      await loadCompanyDetails(company.id);
      setSectionSuccess("Post banner uploaded automatically.");
      window.setTimeout(() => setSectionSuccess(""), 2200);
    } catch (error) {
      console.error("Post banner upload failed:", error);
      setSectionError(
        getMediaErrorMessage(
          error,
          "Unable to upload the post banner. Check the image and your connection, then try again."
        )
      );
    } finally {
      setResourceMediaUploading(false);
      setMediaUploadProgress(0);
    }
  };

  const handlePostGallerySelection = async (files: File[] | FileList | null) => {
    const selected = Array.isArray(files) ? files : Array.from(files || []);

    if (selected.length === 0 || editingLocked || sectionSaving || postGalleryUploading) {
      return;
    }
    const remaining = Math.max(0, 10 - postGalleryMedia.length);

    if (remaining === 0) {
      setSectionError("A maximum of 10 gallery images is allowed.");
      return;
    }

    if (selected.length > remaining) {
      setSectionError(
        `You can add ${remaining} more gallery image${remaining === 1 ? "" : "s"}.`
      );
      return;
    }

    for (const file of selected) {
      const validationError = validatePostImageFile(file);
      if (validationError) {
        setSectionError(`${file.name}: ${validationError}`);
        return;
      }
    }

    const company = companies[0];
    if (!company) return;

    setSectionError("");

    const resourceId = await ensurePostDraftForMedia();
    if (!resourceId) return;

    const uploaded: PostGalleryMedia[] = [];

    try {
      setPostGalleryUploading(true);
      setPostGalleryUploadProgress(0);

      for (let index = 0; index < selected.length; index++) {
        const file = selected[index];

        const result = await uploadProviderMedia({
          companyId: company.id,
          file,
          scope: "resource",
          slot: "gallery",
          resourceType: "posts",
          resourceId,
          onProgress: (percentage) => {
            const overall = Math.round(
              ((index + percentage / 100) / selected.length) * 100
            );
            setPostGalleryUploadProgress(Math.max(0, Math.min(100, overall)));
          },
        });

        const uploadedMedia: PostGalleryMedia = {
          url: result.url,
          contentType: file.type,
          size: file.size,
        };

        uploaded.push(uploadedMedia);
        setPostGalleryMedia((current) => [...current, uploadedMedia].slice(0, 10));
      }
      setPostGalleryUploadProgress(100);
      await loadFoundationSection("posts");
      await loadCompanyDetails(company.id);
      setSectionSuccess(
        `${uploaded.length} gallery image${uploaded.length === 1 ? "" : "s"} uploaded successfully.`
      );
      window.setTimeout(() => setSectionSuccess(""), 2400);
    } catch (error) {
      console.error("Post gallery upload failed:", error);
      setSectionError(
        getMediaErrorMessage(
          error,
          "Unable to upload one or more gallery images. Please try again."
        )
      );
    } finally {
      setPostGalleryUploading(false);
      window.setTimeout(() => setPostGalleryUploadProgress(0), 350);
    }
  };


  const handlePostContentImageUpload = async (
    file: File,
    onProgress?: (percentage: number) => void
  ): Promise<string> => {
    const validationError = validatePostImageFile(file);

    if (validationError) {
      setSectionError(validationError);
      throw new Error(validationError);
    }

    const company = companies[0];
    if (!company) {
      throw new Error("Company profile could not be resolved.");
    }

    setSectionError("");

    const resourceId = await ensurePostDraftForMedia();
    if (!resourceId) {
      throw new Error(
        "Enter the Post Title before uploading images inside the article content."
      );
    }

    try {
      const result = await uploadProviderMedia({
        companyId: company.id,
        file,
        scope: "resource",
        slot: "content",
        resourceType: "posts",
        resourceId,
        onProgress,
      });

      await loadFoundationSection("posts");
      return result.url;
    } catch (error) {
      console.error("Post content image upload failed:", error);
      const message = getMediaErrorMessage(
        error,
        "Unable to upload the image inside the post content. Please try again."
      );
      setSectionError(message);
      throw new Error(message);
    }
  };

  const openWhitepaperResponses = async (item: FoundationItem) => {
    const company = companies[0];
    const user = auth.currentUser;
    if (!company || !user) return;

    try {
      setWhitepaperResponsesOpen(true);
      setWhitepaperResponsesLoading(true);
      setWhitepaperResponsesError("");
      setWhitepaperResponses([]);
      setExpandedWhitepaperResponseId(null);
      setWhitepaperResponsesTitle(
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : "Whitepaper"
      );

      const token = await user.getIdToken();
      const res = await fetch(
        `${API_BASE_URL}/api/providers/${encodeURIComponent(
          company.slug
        )}/whitepapers/${encodeURIComponent(item.id)}/responses`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setWhitepaperResponsesError(
          payload?.message || "Unable to load whitepaper responses."
        );
        return;
      }

      setWhitepaperResponses(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error("Whitepaper responses loading failed:", error);
      setWhitepaperResponsesError("Unable to load whitepaper responses.");
    } finally {
      setWhitepaperResponsesLoading(false);
    }
  };

  const closeWhitepaperResponses = () => {
    if (whitepaperResponsesLoading) return;
    setWhitepaperResponsesOpen(false);
    setWhitepaperResponsesError("");
    setWhitepaperResponses([]);
    setWhitepaperResponsesTitle("");
    setExpandedWhitepaperResponseId(null);
  };

  const openWebinarResponses = async (item: FoundationItem) => {
    const company = companies[0];
    const user = auth.currentUser;
    if (!company || !user) return;

    try {
      setWebinarResponsesOpen(true);
      setWebinarResponsesLoading(true);
      setWebinarResponsesError("");
      setWebinarResponses([]);
      setExpandedWebinarResponseId(null);
      setWebinarResponsesTitle(
        typeof item.title === "string" && item.title.trim()
          ? item.title
          : "Webinar"
      );

      const token = await user.getIdToken();
      const res = await fetch(
        `${API_BASE_URL}/api/providers/${encodeURIComponent(
          company.slug
        )}/webinars/${encodeURIComponent(item.id)}/responses`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setWebinarResponsesError(
          payload?.message || "Unable to load webinar responses."
        );
        return;
      }

      setWebinarResponses(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error("Webinar responses loading failed:", error);
      setWebinarResponsesError("Unable to load webinar responses.");
    } finally {
      setWebinarResponsesLoading(false);
    }
  };

  const closeWebinarResponses = () => {
    if (webinarResponsesLoading) return;
    setWebinarResponsesOpen(false);
    setWebinarResponsesError("");
    setWebinarResponses([]);
    setWebinarResponsesTitle("");
    setExpandedWebinarResponseId(null);
  };

  const saveResource = async (menu: ResourceMenu): Promise<boolean> => {
    const company = companies[0];
    const user = auth.currentUser;
    const config = RESOURCE_CONFIG[menu];

    if (!company || !user) return false;

    if (company.moderationState === "pending_review") {
      setSectionError("Editing is locked while this profile is pending admin review.");
      return false;
    }

    setSectionError("");
    setSectionSuccess("");

    const requiredField = config.fields.find(
      (field) => field.required && !resourceForm[field.key]?.trim()
    );

    if (requiredField) {
      setSectionError(`${requiredField.label} is required.`);
      return false;
    }

    const payload: Record<string, string | string[]> =
      config.fields.reduce<Record<string, string | string[]>>((result, field) => {
        result[field.key] = resourceForm[field.key]?.trim() || "";
        return result;
      }, {});

    if (menu === "products") {
      payload.features = productFeatures;
    }

    if (menu === "posts") {
      const videoEmbedUrl = (resourceForm.videoEmbedUrl || "").trim();

      if (videoEmbedUrl && !getSafeVideoEmbedUrl(videoEmbedUrl)) {
        setSectionError(
          "Enter a supported video URL from YouTube, Vimeo, Loom, Dailymotion or Wistia."
        );
        return false;
      }

      payload.videoEmbedUrl = videoEmbedUrl;
    }

    try {
      setSectionSaving(true);
      const token = await user.getIdToken();
      const url = editingResourceId
        ? `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}/${editingResourceId}`
        : `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}`;

      const res = await fetch(url, {
        method: editingResourceId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json().catch(() => null);

      if (!res.ok) {
        setSectionError(result?.message || `Unable to save ${config.singular.toLowerCase()}.`);
        return false;
      }

      const savedResourceId = String(result?.id || editingResourceId || "");

      if (resourceMediaFile && config.media && savedResourceId) {
        const mediaSaved = await uploadResourceMedia(
          menu,
          savedResourceId,
          resourceMediaFile
        );

        if (!mediaSaved) {
          await loadFoundationSection(menu);
          await loadCompanyDetails(company.id);
          return false;
        }
      }

      setResourceMediaFile(null);
      setPostBannerPreview("");
      setWhitepaperImagePreview("");
      setWebinarBannerPreview("");
      setWebinarSpeakerImagePreview("");
      setPostGalleryMedia([]);
      setProductFeatures([]);
      setProductFeatureDraft("");
      setResourceForm(emptyFormFor(menu));
      setEditingResourceId(null);
      setResourceModalOpen(false);
      await loadFoundationSection(menu);
      await loadCompanyDetails(company.id);
      setSectionSuccess(`${config.singular} draft saved.`);
      window.setTimeout(() => setSectionSuccess(""), 2600);
      return true;
    } catch (error) {
      console.error(`${config.singular} save failed:`, error);
      setSectionError(`Unable to save ${config.singular.toLowerCase()}.`);
      return false;
    } finally {
      setSectionSaving(false);
    }
  };

  const handleCompanyNext = async () => {
    const saved = await handleSaveCompanyDetails();
    if (saved) goToNextStep("company");
  };

  const handleAboutNext = async () => {
    const saved = await saveAbout();
    if (saved) goToNextStep("about");
  };

  const handleResourceNext = async (menu: ResourceMenu) => {
    if (!resourceFormHasContent(menu)) {
      goToNextStep(menu);
      return;
    }

    const saved = await saveResource(menu);
    if (saved) goToNextStep(menu);
  };

  const editResource = (menu: ResourceMenu, item: FoundationItem) => {
    const config = RESOURCE_CONFIG[menu];

    const nextForm = config.fields.reduce<Record<string, string>>((form, field) => {
      const value = item[field.key];
      form[field.key] = typeof value === "string" ? value : "";
      return form;
    }, {});

    if (menu === "posts") {
      nextForm.videoEmbedUrl =
        typeof item.videoEmbedUrl === "string" ? item.videoEmbedUrl : "";
    }

    if (menu === "webinars") {
      if (!nextForm.subTitle && typeof item.subTitle === "string") {
        nextForm.subTitle = item.subTitle;
      }

      if (!nextForm.content) {
        nextForm.content =
          typeof item.content === "string"
            ? item.content
            : typeof item.summary === "string"
              ? item.summary
              : "";
      }

      if (!nextForm.speakerName) {
        nextForm.speakerName =
          typeof item.speakerName === "string"
            ? item.speakerName
            : typeof item.speaker === "string"
              ? item.speaker
              : "";
      }
    }

    if (menu === "events") {
      const splitLegacyDateTime = (value: unknown) => {
        if (typeof value !== "string" || !value.trim()) {
          return { date: "", time: "" };
        }

        const raw = value.trim();
        const direct = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);

        if (direct) {
          return { date: direct[1], time: direct[2] };
        }

        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
          return { date: "", time: "" };
        }

        const pad = (part: number) => String(part).padStart(2, "0");

        return {
          date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
          time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
        };
      };

      const legacyStart = splitLegacyDateTime(item.startAt);
      const legacyEnd = splitLegacyDateTime(item.endAt);

      if (!nextForm.startDate) nextForm.startDate = legacyStart.date;
      if (!nextForm.startTime) nextForm.startTime = legacyStart.time;
      if (!nextForm.endDate) nextForm.endDate = legacyEnd.date;
      if (!nextForm.endTime) nextForm.endTime = legacyEnd.time;
    }

    setEditingResourceId(item.id);
    setResourceMediaFile(null);
    setPostBannerPreview(
      menu === "posts" && typeof item.imageUrl === "string" ? item.imageUrl : ""
    );
    setWhitepaperImagePreview(
      menu === "whitepapers" && typeof item.imageUrl === "string" ? item.imageUrl : ""
    );
    setWebinarBannerPreview(
      menu === "webinars"
        ? typeof item.bannerUrl === "string" && item.bannerUrl
          ? item.bannerUrl
          : typeof item.thumbnailUrl === "string"
            ? item.thumbnailUrl
            : ""
        : ""
    );
    setWebinarSpeakerImagePreview(
      menu === "webinars" && typeof item.speakerImageUrl === "string"
        ? item.speakerImageUrl
        : ""
    );
    setPostGalleryMedia(
      menu === "posts" ? readPostGalleryMedia(item.galleryMedia) : []
    );
    setProductFeatures(
      menu === "products" && Array.isArray(item.features)
        ? item.features
            .filter((feature): feature is string => typeof feature === "string")
            .slice(0, 30)
        : []
    );
    setProductFeatureDraft("");
    setPostGalleryUploadProgress(0);
    setResourceForm(nextForm);
    setSectionError("");
    setSectionSuccess("");
    setResourceModalOpen(true);
  };

  const deleteResource = async (menu: ResourceMenu, resourceId: string) => {
    const company = companies[0];
    const user = auth.currentUser;
    const config = RESOURCE_CONFIG[menu];

    if (!company || !user) return;

    if (company.moderationState === "pending_review") {
      setSectionError("Editing is locked while this profile is pending admin review.");
      return;
    }

    const confirmed = window.confirm(`Delete this ${config.singular.toLowerCase()} draft?`);
    if (!confirmed) return;

    try {
      setSectionSaving(true);
      setSectionError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}/${resourceId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setSectionError(payload?.message || `Unable to delete ${config.singular.toLowerCase()}.`);
        return;
      }

      if (editingResourceId === resourceId) {
        setEditingResourceId(null);
        setResourceMediaFile(null);
        setPostBannerPreview("");
        setWhitepaperImagePreview("");
        setWebinarBannerPreview("");
        setWebinarSpeakerImagePreview("");
        setPostGalleryMedia([]);
        setProductFeatures([]);
        setProductFeatureDraft("");
        setPostGalleryUploadProgress(0);
        setResourceForm(emptyFormFor(menu));
      }

      await loadFoundationSection(menu);
      await loadCompanyDetails(company.id);
      setSectionSuccess(`${config.singular} deleted.`);
      window.setTimeout(() => setSectionSuccess(""), 2200);
    } catch (error) {
      console.error(`${config.singular} delete failed:`, error);
      setSectionError(`Unable to delete ${config.singular.toLowerCase()}.`);
    } finally {
      setSectionSaving(false);
    }
  };

  const loadPreviewFoundation = async () => {
    const company = companies[0];
    const user = auth.currentUser;
    if (!company || !user) return;

    try {
      setPreviewLoading(true);
      setSectionError("");
      const token = await user.getIdToken();

      const entries = await Promise.all(
        (Object.keys(RESOURCE_CONFIG) as ResourceMenu[]).map(async (menu) => {
          const config = RESOURCE_CONFIG[menu];
          const res = await fetch(
            `${API_BASE_URL}/api/company/${company.id}/${config.endpoint}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (!res.ok) return [menu, [] as FoundationItem[]] as const;

          const payload = await res.json().catch(() => []);
          return [menu, Array.isArray(payload) ? payload : []] as const;
        })
      );

      setResourceItems((current) => {
        const next = { ...current };
        for (const [menu, items] of entries) next[menu] = items;
        return next;
      });

      const aboutRes = await fetch(`${API_BASE_URL}/api/company/${company.id}/about`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (aboutRes.ok) {
        const about = await aboutRes.json();
        setAboutForm({
          headline: about?.headline || "",
          overview: about?.overview || "",
          mission: about?.mission || "",
          vision: about?.vision || "",
          foundedYear: about?.foundedYear || "",
          employeeRange: about?.employeeRange || "",
          headquarters: about?.headquarters || "",
          specialtiesText: Array.isArray(about?.specialties)
            ? about.specialties.join(", ")
            : "",
        });
      }
    } catch (error) {
      console.error("Preview loading failed:", error);
      setSectionError("Unable to prepare the profile preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const submitCompanyForReview = async () => {
    const company = companies[0];
    const user = auth.currentUser;

    if (!company || !user) return;

    try {
      setSubmitLoading(true);
      setSectionError("");
      setSectionSuccess("");
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/company/${company.id}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setSectionError(payload?.message || "Unable to submit the company profile.");
        return;
      }

      setCompanies((current) =>
        current.map((item) =>
          item.id === payload.id ? { ...item, ...payload } : item
        )
      );

      await loadCompanyDetails(company.id);
      setSectionSuccess(
        company.moderationState === "changes_requested"
          ? "Revised company profile resubmitted for admin review."
          : company.moderationState === "rejected"
            ? "Corrected company profile submitted for admin review."
            : "Company profile submitted for admin review."
      );
    } catch (error) {
      console.error("Submission failed:", error);
      setSectionError("Unable to submit the company profile.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      window.sessionStorage.removeItem("publisherSessionExpired");
      await signOut(auth);
      router.replace("/publisher/login");
    } finally {
      setShowLogoutModal(false);
    }
  };

  const goTo = (key: PublisherMenu) => {
    setResourceModalOpen(false);
    setActiveMenu(key);
    setMobileSidebarOpen(false);
  };

  if (loading) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

          .pub-shell-loader {
            min-height:100vh;
            background:#f6f7f9;
            font-family:"Plus Jakarta Sans",sans-serif;
            display:flex;
            align-items:center;
            justify-content:center;
          }

          .pub-loader-card {
            width:min(420px,calc(100vw - 32px));
            background:#fff;
            border:1px solid #eceef1;
            border-radius:28px;
            padding:26px;
            box-shadow:0 24px 70px rgba(15,23,42,.07);
          }

          .pub-shimmer {
            position:relative;
            overflow:hidden;
            background:#eef1f4;
            border-radius:999px;
          }

          .pub-shimmer::after {
            content:"";
            position:absolute;
            inset:0;
            transform:translateX(-100%);
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);
            animation:pubShimmer 1.15s infinite;
          }

          @keyframes pubShimmer {
            100% { transform:translateX(100%); }
          }
        `}</style>

        <div className="pub-shell-loader">
          <motion.div
            className="pub-loader-card"
            initial={{ opacity: 0, y: 14, scale: .985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="pub-shimmer" style={{ width: 42, height: 42, borderRadius: 14, marginBottom: 18 }} />
            <div className="pub-shimmer" style={{ width: "56%", height: 18, marginBottom: 11 }} />
            <div className="pub-shimmer" style={{ width: "82%", height: 10, marginBottom: 7 }} />
            <div className="pub-shimmer" style={{ width: "68%", height: 10 }} />
          </motion.div>
        </div>
      </>
    );
  }

  if (!access) return null;

  const displayName = access.email?.split("@")[0] || "Publisher";
  const initials = displayName.slice(0, 1).toUpperCase();
  const currentCompany = companies[0];
  const moderationState = currentCompany?.moderationState || "draft";
  const editingLocked = moderationState === "pending_review";
  const needsRevision = moderationState === "changes_requested";
  const isRejected = moderationState === "rejected";
  const isApproved = moderationState === "approved" && currentCompany?.status === "published";
  const isUnpublished = currentCompany?.status === "unpublished";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *,*::before,*::after{box-sizing:border-box}

        .pub-shimmer {
          position:relative;
          overflow:hidden;
          background:#eef1f4;
          border-radius:999px;
        }

        .pub-shimmer::after {
          content:"";
          position:absolute;
          inset:0;
          transform:translateX(-100%);
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);
          animation:pubShimmer 1.15s infinite;
        }

        @keyframes pubShimmer {
          100% { transform:translateX(100%); }
        }

        .pub-root {
          height:100vh;
          display:flex;
          overflow:hidden;
          background:#f5f6f8;
          color:#111827;
          font-family:"Plus Jakarta Sans",sans-serif;
          font-weight:400;
        }

        .pub-sidebar {
          height:100vh;
          flex-shrink:0;
          display:flex;
          flex-direction:column;
          background:#fff;
          border-right:1px solid #eceef1;
          box-shadow:2px 0 12px rgba(15,23,42,.035);
          transition:width .28s cubic-bezier(.22,1,.36,1), transform .28s cubic-bezier(.22,1,.36,1);
          position:relative;
          z-index:50;
          overflow:hidden;
        }

        .pub-sidebar.open{width:246px}
        .pub-sidebar.closed{width:68px}

        .pub-side-head {
          min-height:72px;
          padding:14px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
          border-bottom:1px solid #f0f1f3;
          flex-shrink:0;
        }

        .pub-profile {
          min-width:0;
          display:flex;
          align-items:center;
          gap:10px;
          overflow:hidden;
        }

        .pub-avatar {
          width:38px;
          height:38px;
          border-radius:14px;
          background:#111827;
          color:#fff;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:13px;
          font-weight:800;
          flex-shrink:0;
          box-shadow:0 5px 14px rgba(17,24,39,.14);
        }

        .pub-profile-name {
          font-size:12px;
          font-weight:700;
          color:#111827;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          max-width:152px;
        }

        .pub-profile-role {
          margin-top:2px;
          font-size:9px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.09em;
          color:#9aa2ad;
        }

        .pub-collapse {
          width:31px;
          height:31px;
          border-radius:999px;
          border:1px solid #e6e8ec;
          background:#fff;
          color:#717987;
          display:flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          flex-shrink:0;
          transition:background .18s ease,color .18s ease,transform .2s cubic-bezier(.22,1,.36,1);
        }

        .pub-collapse:hover{background:#f5f6f8;color:#111827;transform:scale(1.03)}

        .pub-nav {
          flex:1;
          padding:12px 9px;
          display:flex;
          flex-direction:column;
          justify-content:center;
          gap:3px;
          overflow-y:auto;
          scrollbar-width:none;
        }

        .pub-nav::-webkit-scrollbar{display:none}

        .pub-nav-btn {
          width:100%;
          min-height:40px;
          border:none;
          border-radius:13px;
          background:transparent;
          color:#6d7582;
          display:flex;
          align-items:center;
          gap:10px;
          padding:0 11px;
          cursor:pointer;
          font-family:inherit;
          font-size:12px;
          font-weight:500;
          text-align:left;
          white-space:nowrap;
          transition:background .18s ease,color .18s ease,transform .18s ease;
        }

        .pub-nav-btn:hover{background:#f6f7f8;color:#111827}
        .pub-nav-btn.active{background:#111827;color:#fff;font-weight:700;box-shadow:0 5px 14px rgba(17,24,39,.09)}
        .pub-nav-btn.col{justify-content:center;padding:0}

        .pub-side-foot {
          padding:10px 9px;
          border-top:1px solid #f0f1f3;
          flex-shrink:0;
        }

        .pub-logout {
          width:100%;
          height:40px;
          border:none;
          border-radius:999px;
          background:transparent;
          color:#dc2626;
          display:flex;
          align-items:center;
          gap:10px;
          padding:0 11px;
          font-family:inherit;
          font-size:12px;
          font-weight:600;
          cursor:pointer;
          transition:background .18s ease;
        }

        .pub-logout:hover{background:#fff2f2}
        .pub-logout.col{justify-content:center;padding:0}

        .pub-main {
          min-width:0;
          flex:1;
          display:flex;
          flex-direction:column;
          overflow:hidden;
        }

        .pub-topbar {
          height:64px;
          flex-shrink:0;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          padding:0 28px;
          background:rgba(255,255,255,.94);
          backdrop-filter:blur(18px);
          border-bottom:1px solid #eceef1;
        }

        .pub-topbar-left{display:flex;align-items:center;gap:12px}
        .pub-mobile-menu{
          width:34px;height:34px;border-radius:11px;border:1px solid #e4e7eb;
          background:#fff;color:#374151;display:none;align-items:center;justify-content:center;cursor:pointer;
        }

        .pub-page-title {
          font-size:16px;
          font-weight:800;
          letter-spacing:-.025em;
          color:#111827;
        }

        .pub-status-pill {
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:7px 11px;
          border-radius:999px;
          border:1px solid #e7e9ed;
          background:#fff;
          color:#5f6876;
          font-size:10px;
          font-weight:700;
          letter-spacing:.03em;
        }

        .pub-session-clock {
          min-width:42px;
          text-align:center;
          color:#111827;
          font-size:10.5px;
          font-weight:800;
          letter-spacing:.04em;
          font-variant-numeric:tabular-nums;
        }

        .pub-status-pill.expiring {
          border-color:#fed7aa;
          background:#fff7ed;
          color:#c2410c;
        }

        .pub-status-pill.expiring .pub-session-clock {
          color:#c2410c;
        }

        .pub-content {
          flex:1;
          min-height:0;
          overflow-y:auto;
          padding:28px;
          scrollbar-width:none;
        }

        .pub-content::-webkit-scrollbar{display:none}

        .pub-page-wrap {
          width:min(1180px,100%);
          margin:0 auto;
        }

        .pub-hero {
          display:grid;
          grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);
          gap:18px;
          margin-bottom:18px;
        }

        .pub-hero-card {
          position:relative;
          overflow:hidden;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          padding:30px;
          box-shadow:0 16px 45px rgba(15,23,42,.055);
        }

        .pub-hero-card::after {
          content:"";
          position:absolute;
          width:240px;
          height:240px;
          right:-110px;
          top:-120px;
          border-radius:50%;
          background:rgba(17,24,39,.035);
          pointer-events:none;
        }

        .pub-eyebrow {
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:6px 10px;
          border-radius:999px;
          background:#f5f6f8;
          border:1px solid #eceef1;
          color:#68717f;
          font-size:10px;
          font-weight:700;
          letter-spacing:.045em;
          text-transform:uppercase;
          margin-bottom:18px;
        }

        .pub-heading {
          margin:0;
          max-width:690px;
          font-size:clamp(28px,3.2vw,44px);
          line-height:1.04;
          letter-spacing:-.05em;
          font-weight:800;
          color:#111827;
        }

        .pub-heading span{color:#89919e}

        .pub-body-copy {
          margin:16px 0 0;
          max-width:650px;
          font-size:13px;
          line-height:1.75;
          font-weight:400;
          color:#7a8391;
        }

        .pub-hero-actions {
          display:flex;
          flex-wrap:wrap;
          gap:9px;
          margin-top:24px;
        }

        .pub-primary-btn,
        .pub-secondary-btn {
          height:42px;
          border-radius:999px;
          padding:0 16px;
          font-family:inherit;
          font-size:11px;
          font-weight:700;
          cursor:pointer;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:7px;
          transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s ease,background .2s ease;
        }

        .pub-primary-btn {
          border:1px solid #111827;
          background:#111827;
          color:#fff;
          box-shadow:0 6px 18px rgba(17,24,39,.12);
        }

        .pub-primary-btn:hover{background:#000;transform:translateY(-1px);box-shadow:0 10px 24px rgba(17,24,39,.16)}
        .pub-secondary-btn{border:1px solid #e4e7eb;background:#fff;color:#4f5866}
        .pub-secondary-btn:hover{background:#f7f8fa;transform:translateY(-1px)}

        .pub-side-card {
          background:#111827;
          color:#fff;
          border-radius:26px;
          padding:25px;
          position:relative;
          overflow:hidden;
          box-shadow:0 16px 45px rgba(15,23,42,.10);
        }

        .pub-side-card::before {
          content:"";
          position:absolute;
          width:210px;
          height:210px;
          border-radius:50%;
          right:-90px;
          bottom:-100px;
          background:rgba(255,255,255,.05);
        }

        .pub-side-icon {
          width:40px;height:40px;border-radius:14px;
          display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,.08);
          border:1px solid rgba(255,255,255,.08);
          margin-bottom:22px;
        }

        .pub-side-label {
          font-size:10px;
          font-weight:700;
          letter-spacing:.07em;
          text-transform:uppercase;
          color:rgba(255,255,255,.42);
          margin-bottom:8px;
        }

        .pub-side-value {
          font-size:22px;
          line-height:1.2;
          font-weight:800;
          letter-spacing:-.035em;
          margin-bottom:9px;
        }

        .pub-side-copy {
          font-size:11px;
          line-height:1.6;
          color:rgba(255,255,255,.45);
          max-width:240px;
        }

        .pub-grid {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:14px;
        }

        .pub-card {
          background:#fff;
          border:1px solid #e9ebef;
          border-radius:22px;
          padding:20px;
          min-height:156px;
          cursor:pointer;
          transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s ease,border-color .22s ease;
        }

        .pub-card:hover {
          transform:translateY(-3px);
          border-color:#dde1e7;
          box-shadow:0 16px 34px rgba(15,23,42,.07);
        }

        .pub-card-icon {
          width:36px;height:36px;border-radius:12px;
          display:flex;align-items:center;justify-content:center;
          background:#f6f7f9;
          border:1px solid #eceef1;
          color:#606978;
          margin-bottom:17px;
        }

        .pub-card-title {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          font-size:13px;
          font-weight:700;
          color:#111827;
          margin-bottom:6px;
        }

        .pub-card-copy {
          color:#969eaa;
          font-size:11px;
          line-height:1.65;
          font-weight:400;
        }



        .pub-workflow-banner {
          width:100%;
          margin:0 0 16px;
          padding:14px 16px;
          border-radius:18px;
          border:1px solid #e5e7eb;
          background:#fff;
          display:flex;
          align-items:flex-start;
          gap:11px;
          box-shadow:0 8px 24px rgba(15,23,42,.035);
        }

        .pub-workflow-banner.revision {
          background:#eff6ff;
          border-color:#dbeafe;
          color:#1d4ed8;
        }

        .pub-workflow-banner.rejected {
          background:#fff5f5;
          border-color:#fee2e2;
          color:#b91c1c;
        }

        .pub-workflow-banner.approved {
          background:#f0fdf4;
          border-color:#dcfce7;
          color:#15803d;
        }

        .pub-workflow-banner.pending {
          background:#fff7ed;
          border-color:#ffedd5;
          color:#c2410c;
        }

        .pub-workflow-banner.unpublished {
          background:#fffbeb;
          border-color:#fde68a;
          color:#92400e;
        }

        .pub-workflow-banner-icon {
          width:34px;
          height:34px;
          border-radius:11px;
          flex-shrink:0;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,.72);
          border:1px solid rgba(255,255,255,.8);
        }

        .pub-workflow-banner-content {
          flex:1;
          min-width:0;
        }

        .pub-workflow-banner-title {
          font-size:11.5px;
          font-weight:800;
          margin-bottom:3px;
          letter-spacing:-.01em;
        }

        .pub-workflow-banner-copy {
          font-size:10px;
          line-height:1.6;
          opacity:.82;
          white-space:pre-wrap;
        }

        .pub-workflow-banner-action {
          flex-shrink:0;
          height:31px;
          padding:0 11px;
          border-radius:999px;
          border:1px solid currentColor;
          background:rgba(255,255,255,.68);
          color:inherit;
          font-family:inherit;
          font-size:9px;
          font-weight:800;
          cursor:pointer;
        }

        .pub-edit-lock-note {
          margin-bottom:14px;
          padding:10px 13px;
          border-radius:14px;
          background:#fff7ed;
          border:1px solid #ffedd5;
          color:#c2410c;
          font-size:10px;
          font-weight:600;
          line-height:1.55;
        }

        @media(max-width:640px){
          .pub-workflow-banner{flex-wrap:wrap}
          .pub-workflow-banner-action{margin-left:45px}
        }

        .pub-company-shell {
          min-height:calc(100vh - 120px);
          display:flex;
          align-items:flex-start;
          justify-content:stretch;
          width:100%;
        }

        .pub-company-create {
          width:100%;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          padding:34px;
          box-shadow:0 18px 48px rgba(15,23,42,.055);
          position:relative;
          overflow:hidden;
        }

        .pub-company-create::after {
          content:"";
          position:absolute;
          width:230px;
          height:230px;
          border-radius:50%;
          right:-120px;
          top:-120px;
          background:rgba(17,24,39,.032);
          pointer-events:none;
        }

        .pub-company-create-icon {
          width:48px;
          height:48px;
          border-radius:16px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#f5f6f8;
          border:1px solid #e8eaee;
          color:#111827;
          margin-bottom:20px;
        }

        .pub-company-create-title {
          margin:0 0 8px;
          font-size:26px;
          line-height:1.12;
          font-weight:800;
          letter-spacing:-.04em;
          color:#111827;
        }

        .pub-company-create-copy {
          margin:0 0 24px;
          max-width:580px;
          color:#838c99;
          font-size:12px;
          line-height:1.75;
          font-weight:400;
        }

        .pub-company-form {
          display:flex;
          gap:10px;
          align-items:center;
          position:relative;
          z-index:1;
        }

        .pub-company-input {
          flex:1;
          height:46px;
          border:1.5px solid #e4e7eb;
          border-radius:999px;
          background:#fafbfc;
          color:#111827;
          outline:none;
          padding:0 17px;
          font-family:inherit;
          font-size:13px;
          font-weight:400;
          transition:border-color .2s ease,box-shadow .2s ease,background .2s ease,transform .2s cubic-bezier(.22,1,.36,1);
        }

        .pub-company-input::placeholder{color:#b0b7c1}
        .pub-company-input:focus{
          border-color:#111827;
          background:#fff;
          box-shadow:0 0 0 4px rgba(17,24,39,.055);
          transform:translateY(-1px);
        }

        .pub-company-error {
          margin:0 0 14px;
          padding:10px 13px;
          border-radius:14px;
          background:#fff5f5;
          border:1px solid #fee2e2;
          color:#b91c1c;
          font-size:11px;
          line-height:1.55;
          font-weight:500;
          position:relative;
          z-index:1;
        }

        .pub-company-note {
          margin-top:16px;
          padding:11px 13px;
          display:flex;
          align-items:flex-start;
          gap:9px;
          border-radius:14px;
          background:#f8fafc;
          border:1px solid #edf0f3;
          color:#7b8492;
          font-size:10.5px;
          line-height:1.55;
          position:relative;
          z-index:1;
        }


        .pub-company-editor {
          width:100%;
          display:grid;
          grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);
          gap:16px;
          align-items:start;
        }

        .pub-company-editor-main {
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          padding:28px;
          box-shadow:0 18px 48px rgba(15,23,42,.055);
        }

        .pub-company-editor-side {
          background:#111827;
          color:#fff;
          border-radius:26px;
          padding:24px;
          position:sticky;
          top:0;
          box-shadow:0 16px 42px rgba(15,23,42,.09);
        }

        .pub-company-editor-head {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          margin-bottom:22px;
        }

        .pub-company-editor-title {
          margin:0 0 6px;
          font-size:22px;
          font-weight:800;
          letter-spacing:-.035em;
          color:#111827;
        }

        .pub-company-editor-copy {
          margin:0;
          max-width:600px;
          color:#8b94a2;
          font-size:11.5px;
          line-height:1.7;
        }

        .pub-company-save-status {
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:7px 10px;
          border-radius:999px;
          font-size:10px;
          font-weight:700;
          white-space:nowrap;
          background:#f0fdf4;
          border:1px solid #dcfce7;
          color:#15803d;
        }


        .pub-media-section {
          margin-bottom:24px;
          padding-bottom:24px;
          border-bottom:1px solid #f0f1f3;
        }

        .pub-media-section-head {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
          margin-bottom:14px;
        }

        .pub-media-section-title {
          display:flex;
          align-items:center;
          gap:8px;
          color:#111827;
          font-size:13px;
          font-weight:800;
          letter-spacing:-.015em;
        }

        .pub-media-section-copy {
          margin-top:4px;
          color:#959da8;
          font-size:10.5px;
          line-height:1.55;
        }

        .pub-media-pending-pill {
          display:inline-flex;
          align-items:center;
          gap:6px;
          border:1px solid #e5e7eb;
          background:#f8fafc;
          color:#737c89;
          padding:6px 9px;
          border-radius:999px;
          font-size:9px;
          font-weight:700;
          white-space:nowrap;
        }

        .pub-media-grid {
          display:grid;
          grid-template-columns:minmax(190px,.72fr) minmax(0,1.28fr);
          gap:14px;
        }

        .pub-media-card {
          min-width:0;
        }

        .pub-media-label {
          display:flex;
          align-items:center;
          gap:6px;
          margin:0 0 7px 2px;
          color:#727b89;
          font-size:10px;
          font-weight:700;
          letter-spacing:.055em;
          text-transform:uppercase;
        }

        .pub-media-drop {
          position:relative;
          display:block;
          overflow:hidden;
          border:1.5px solid rgba(37,99,235,.52);
          background:#fbfdff;
          cursor:pointer;
          box-shadow:
            0 0 0 3px rgba(59,130,246,.055),
            0 8px 22px rgba(37,99,235,.07);
          transition:
            border-color .2s ease,
            background .2s ease,
            transform .2s cubic-bezier(.22,1,.36,1),
            box-shadow .2s ease;
        }

        .pub-media-drop:hover,
        .pub-media-drop.dragging {
          border-color:#2563eb;
          background:#fff;
          cursor:pointer;
          transform:translateY(-1px);
          box-shadow:
            0 0 0 4px rgba(37,99,235,.10),
            0 12px 30px rgba(37,99,235,.13);
        }

        .pub-media-drop.logo {
          min-height:172px;
          border-radius:22px;
        }

        .pub-media-drop.banner {
          min-height:172px;
          border-radius:22px;
        }

        .pub-media-input {
          position:absolute;
          width:1px;
          height:1px;
          opacity:0;
          pointer-events:none;
        }

        .pub-media-empty {
          min-height:172px;
          padding:22px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          text-align:center;
        }

        .pub-media-empty-icon {
          width:42px;
          height:42px;
          border-radius:14px;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#68717f;
          background:#f2f4f7;
          border:1px solid #e8ebef;
          margin-bottom:11px;
        }

        .pub-media-empty-title {
          color:#333b47;
          font-size:11px;
          font-weight:700;
          margin-bottom:4px;
        }

        .pub-media-empty-copy {
          color:#a0a7b2;
          font-size:9.5px;
          line-height:1.5;
        }

        .pub-media-preview {
          width:100%;
          height:172px;
          position:relative;
          background:#f3f4f6;
        }

        .pub-media-preview img {
          width:100%;
          height:100%;
          display:block;
        }

        .pub-media-preview.logo img {
          object-fit:contain;
          padding:22px;
          background:#fff;
        }

        .pub-media-preview.banner img {
          object-fit:cover;
        }

        .pub-media-overlay {
          position:absolute;
          inset:auto 10px 10px 10px;
          display:flex;
          justify-content:flex-end;
          gap:7px;
          opacity:0;
          transform:translateY(4px);
          transition:opacity .18s ease,transform .18s ease;
        }

        .pub-media-drop:hover .pub-media-overlay {
          opacity:1;
          transform:translateY(0);
        }

        .pub-media-action {
          height:31px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.5);
          background:rgba(17,24,39,.82);
          backdrop-filter:blur(10px);
          color:#fff;
          display:inline-flex;
          align-items:center;
          gap:5px;
          padding:0 10px;
          font-family:inherit;
          font-size:9px;
          font-weight:700;
          cursor:pointer;
        }

        .pub-media-error {
          margin:7px 2px 0;
          color:#b91c1c;
          font-size:9.5px;
          line-height:1.45;
        }

        .pub-media-selected {
          margin:7px 2px 0;
          color:#6b7280;
          font-size:9.5px;
          line-height:1.45;
        }

        .pub-media-upload-row {
          margin-top:9px; display:flex; align-items:center; gap:7px; flex-wrap:wrap;
        }
        .pub-media-upload-btn {
          min-height:31px; padding:0 11px; border-radius:999px; border:1px solid #111827;
          background:#111827; color:#fff; display:inline-flex; align-items:center; gap:6px;
          font-family:inherit; font-size:9px; font-weight:800; cursor:pointer;
        }
        .pub-media-upload-btn.secondary { background:#fff; border-color:#e4e7eb; color:#66707f; }
        .pub-media-upload-btn:disabled { opacity:.45; cursor:not-allowed; }
        .pub-media-progress {
          width:100%;
          margin-top:9px;
          display:flex;
          align-items:center;
          gap:9px;
          color:#66707f;
          font-size:9px;
          font-weight:700;
        }

        .pub-media-progress-track {
          position:relative;
          flex:1;
          min-width:90px;
          height:6px;
          overflow:hidden;
          border-radius:999px;
          background:#e8eefc;
          box-shadow:inset 0 0 0 1px rgba(37,99,235,.06);
        }

        .pub-media-progress-fill {
          height:100%;
          border-radius:999px;
          background:linear-gradient(90deg,#2563eb,#60a5fa);
          box-shadow:0 0 10px rgba(37,99,235,.30);
          transition:width .12s linear;
        }

        .pub-media-progress-value {
          width:34px;
          flex-shrink:0;
          text-align:right;
          color:#2563eb;
          font-size:9px;
          font-weight:800;
          font-variant-numeric:tabular-nums;
        }

        .pub-resource-media {
          grid-column:1 / -1;
          border:1.5px solid rgba(37,99,235,.52);
          background:#fbfdff;
          border-radius:18px;
          padding:14px;
          cursor:pointer;
          box-shadow:
            0 0 0 3px rgba(59,130,246,.055),
            0 8px 22px rgba(37,99,235,.07);
          transition:
            border-color .2s ease,
            background .2s ease,
            box-shadow .2s ease,
            transform .2s cubic-bezier(.22,1,.36,1);
        }

        .pub-resource-media:hover,
        .pub-resource-media:focus-within {
          border-color:#2563eb;
          background:#fff;
          cursor:pointer;
          transform:translateY(-1px);
          box-shadow:
            0 0 0 4px rgba(37,99,235,.10),
            0 12px 30px rgba(37,99,235,.13);
        }
        .pub-resource-media-title {
          display:flex; align-items:center; gap:7px; font-size:10px; font-weight:800;
          color:#4b5563; margin-bottom:5px;
        }
        .pub-resource-media-copy {
          color:#9aa2ad; font-size:9.5px; line-height:1.55; margin-bottom:10px;
        }
        .pub-resource-file {
          width:100%;
          font-family:inherit;
          font-size:10px;
          color:#66707f;
          cursor:pointer;
        }

        .pub-resource-file::file-selector-button {
          cursor:pointer;
        }

        .pub-resource-file:disabled,
        .pub-resource-file:disabled::file-selector-button {
          cursor:not-allowed;
        }
        .pub-media-attached {
          margin-top:8px; display:inline-flex; align-items:center; gap:5px; padding:5px 8px;
          border-radius:999px; background:#f0fdf4; border:1px solid #dcfce7;
          color:#15803d; font-size:8.5px; font-weight:700;
        }

        .pub-post-banner-preview {
          margin-top:12px;
          width:220px;
          max-width:100%;
          overflow:hidden;
          border:1px solid #dbe4f0;
          border-radius:14px;
          background:#fff;
          box-shadow:0 8px 20px rgba(15,23,42,.07);
        }

        .pub-post-banner-preview img {
          width:100%;
          height:112px;
          object-fit:cover;
          display:block;
          background:#eef1f4;
        }

        .pub-post-banner-preview-copy {
          min-height:32px;
          display:flex;
          align-items:center;
          gap:6px;
          padding:0 10px;
          color:#15803d;
          background:#f8fff9;
          border-top:1px solid #e8f5eb;
          font-size:8.5px;
          font-weight:800;
        }

        .pub-webinar-media-grid {
          grid-column:1 / -1;
          display:grid;
          grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);
          gap:14px;
          align-items:start;
        }

        .pub-webinar-media-grid .pub-resource-media {
          height:100%;
        }

        .pub-post-banner-preview.webinar-banner img {
          max-height:270px;
          object-fit:cover;
        }

        .pub-webinar-speaker-preview {
          margin-top:12px;
          overflow:hidden;
          border:1px solid #e4e8ee;
          border-radius:16px;
          background:#fff;
        }

        .pub-webinar-speaker-preview img {
          width:100%;
          height:220px;
          display:block;
          object-fit:cover;
          object-position:center top;
          background:#f5f6f8;
        }

        @media(max-width:760px){
          .pub-webinar-media-grid{grid-template-columns:1fr}
          .pub-webinar-speaker-preview img{height:260px}
        }

        .pub-post-video-embed {
          grid-column:1 / -1;
          border:1.5px solid #e2e7ee;
          background:#fafbfc;
          border-radius:18px;
          padding:15px;
          transition:border-color .2s ease,box-shadow .2s ease,background .2s ease;
        }

        .pub-post-video-embed:focus-within {
          border-color:#2563eb;
          background:#fff;
          box-shadow:
            0 0 0 4px rgba(37,99,235,.08),
            0 10px 26px rgba(37,99,235,.08);
        }

        .pub-post-video-preview {
          position:relative;
          width:100%;
          aspect-ratio:16 / 9;
          overflow:hidden;
          margin-top:12px;
          border-radius:14px;
          border:1px solid #e3e7ed;
          background:#111827;
          box-shadow:0 10px 28px rgba(15,23,42,.10);
        }

        .pub-post-video-preview iframe {
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          border:0;
          display:block;
        }

        .pub-post-video-error {
          margin-top:8px;
          padding:9px 11px;
          border-radius:12px;
          border:1px solid #fecdd3;
          background:#fff1f2;
          color:#be123c;
          font-size:9.5px;
          font-weight:600;
          line-height:1.55;
        }

        .pub-post-gallery-uploader {
          grid-column:1 / -1;
          border:1.5px solid rgba(37,99,235,.52);
          background:#fbfdff;
          border-radius:18px;
          padding:15px;
          box-shadow:
            0 0 0 3px rgba(59,130,246,.055),
            0 8px 22px rgba(37,99,235,.07);
          transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease;
        }

        .pub-post-gallery-uploader:hover {
          border-color:#2563eb;
          box-shadow:
            0 0 0 4px rgba(37,99,235,.10),
            0 12px 30px rgba(37,99,235,.13);
        }

        .pub-post-gallery-head {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          margin-bottom:10px;
        }

        .pub-post-gallery-count {
          flex-shrink:0;
          padding:5px 8px;
          border-radius:999px;
          background:#eff6ff;
          border:1px solid #dbeafe;
          color:#2563eb;
          font-size:8.5px;
          font-weight:800;
        }

        .pub-post-gallery-input {
          position:absolute;
          width:1px;
          height:1px;
          opacity:0;
          pointer-events:none;
        }

        .pub-post-gallery-trigger {
          min-height:42px;
          border:1px dashed #bfdbfe;
          border-radius:14px;
          background:#fff;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:7px;
          color:#315f9f;
          font-size:9.5px;
          font-weight:800;
          cursor:pointer;
          transition:background .16s ease,border-color .16s ease;
        }

        .pub-post-gallery-trigger:hover {
          background:#f8fbff;
          border-color:#60a5fa;
        }

        .pub-post-gallery-trigger.disabled {
          opacity:.48;
          cursor:not-allowed;
        }

        .pub-post-gallery-preview {
          display:grid;
          grid-template-columns:repeat(5,minmax(0,1fr));
          gap:8px;
          margin-top:12px;
        }

        .pub-post-gallery-thumb {
          aspect-ratio:1 / .78;
          overflow:hidden;
          border-radius:11px;
          border:1px solid #e6eaf0;
          background:#f2f4f7;
        }

        .pub-post-gallery-thumb img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        @media(max-width:700px){
          .pub-post-gallery-preview{grid-template-columns:repeat(2,minmax(0,1fr))}
        }


        @media(max-width:700px){
          .pub-media-grid{grid-template-columns:1fr}
          .pub-media-section-head{flex-direction:column}
        }

        .pub-company-fields {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:15px;
        }

        .pub-company-field.full { grid-column:1 / -1; }

        .pub-company-field label {
          display:flex;
          align-items:center;
          gap:6px;
          margin:0 0 7px 2px;
          color:#727b89;
          font-size:10px;
          font-weight:700;
          letter-spacing:.055em;
          text-transform:uppercase;
        }

        .pub-company-control,
        .pub-company-textarea {
          width:100%;
          border:1.5px solid #e4e7eb;
          background:#fafbfc;
          color:#111827;
          outline:none;
          border-radius:18px;
          font-family:inherit;
          font-size:12.5px;
          font-weight:400;
          transition:border-color .2s ease,box-shadow .2s ease,background .2s ease,transform .2s cubic-bezier(.22,1,.36,1);
        }

        .pub-company-control {
          height:46px;
          padding:0 15px;
          border-radius:999px;
        }

        .pub-company-textarea {
          min-height:112px;
          resize:vertical;
          padding:13px 15px;
          line-height:1.65;
        }

        .pub-company-control::placeholder,
        .pub-company-textarea::placeholder {
          color:#b0b7c1;
        }

        .pub-company-control:focus,
        .pub-company-textarea:focus {
          border-color:#111827;
          background:#fff;
          box-shadow:0 0 0 4px rgba(17,24,39,.055);
          transform:translateY(-1px);
        }

        .pub-company-field-note {
          margin:6px 2px 0;
          color:#a0a7b2;
          font-size:9.5px;
          line-height:1.45;
        }

        .pub-category-multiselect {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          padding:12px;
          border:1.5px solid #e4e7eb;
          border-radius:18px;
          background:#fafbfc;
          transition:border-color .2s ease,box-shadow .2s ease,background .2s ease;
        }

        .pub-category-multiselect:focus-within {
          border-color:#111827;
          background:#fff;
          box-shadow:0 0 0 4px rgba(17,24,39,.055);
        }

        .pub-category-multiselect.disabled {
          opacity:.62;
          cursor:not-allowed;
        }

        .pub-category-option {
          min-height:34px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          padding:0 12px;
          border:1px solid #dfe3e8;
          border-radius:999px;
          background:#fff;
          color:#66707f;
          font-family:inherit;
          font-size:10px;
          font-weight:700;
          cursor:pointer;
          transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease;
        }

        .pub-category-option:hover:not(:disabled) {
          border-color:#b9c0ca;
          color:#111827;
          transform:translateY(-1px);
        }

        .pub-category-option.selected {
          border-color:#111827;
          background:#111827;
          color:#fff;
        }

        .pub-category-option.selected:hover:not(:disabled) {
          border-color:#111827;
          background:#111827;
          color:#fff;
        }

        .pub-category-option:disabled {
          cursor:not-allowed;
        }

        .pub-company-count {
          text-align:right;
          margin-top:5px;
          color:#a3aab4;
          font-size:9.5px;
        }

        .pub-company-editor-actions {
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:9px;
          margin-top:22px;
          padding-top:18px;
          border-top:1px solid #f0f1f3;
        }

        .pub-company-editor-side-label {
          color:rgba(255,255,255,.42);
          font-size:10px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.07em;
          margin-bottom:9px;
        }

        .pub-company-editor-side-title {
          margin:0 0 8px;
          font-size:21px;
          line-height:1.2;
          font-weight:800;
          letter-spacing:-.035em;
        }

        .pub-company-editor-side-copy {
          color:rgba(255,255,255,.46);
          font-size:11px;
          line-height:1.65;
          margin-bottom:18px;
        }

        .pub-company-editor-list {
          display:flex;
          flex-direction:column;
          gap:10px;
          padding-top:16px;
          border-top:1px solid rgba(255,255,255,.08);
        }

        .pub-company-editor-list-row {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          color:rgba(255,255,255,.66);
          font-size:10.5px;
        }

        .pub-company-editor-list-row span:last-child {
          color:#fff;
          font-weight:700;
          text-transform:capitalize;
        }

        @media(max-width:900px){
          .pub-company-editor{grid-template-columns:1fr}
          .pub-company-editor-side{position:static}
        }

        @media(max-width:620px){
          .pub-company-fields{grid-template-columns:1fr}
          .pub-company-field.full{grid-column:auto}
          .pub-company-editor-main{padding:22px 18px}
          .pub-company-editor-head{flex-direction:column}
          .pub-company-editor-actions{justify-content:flex-end;flex-wrap:wrap}
          .pub-company-editor-actions .pub-primary-btn,
          .pub-company-editor-actions .pub-secondary-btn{flex:1;min-width:130px}
        }

        .pub-company-summary {
          display:grid;
          grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);
          gap:16px;
        }

        .pub-company-main-card,
        .pub-company-status-card {
          border-radius:26px;
          border:1px solid #e8eaee;
          box-shadow:0 16px 42px rgba(15,23,42,.05);
        }

        .pub-company-main-card {
          background:#fff;
          padding:30px;
        }

        .pub-company-status-card {
          background:#111827;
          color:#fff;
          padding:26px;
        }

        .pub-company-badge {
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:6px 10px;
          border-radius:999px;
          background:#f5f6f8;
          border:1px solid #eaecf0;
          color:#68717f;
          font-size:10px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.05em;
          margin-bottom:18px;
        }

        .pub-company-name {
          margin:0 0 8px;
          color:#111827;
          font-size:30px;
          font-weight:800;
          letter-spacing:-.045em;
          line-height:1.1;
        }

        .pub-company-slug {
          font-size:11px;
          color:#9aa2ad;
          margin-bottom:20px;
        }

        .pub-company-meta {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        }

        .pub-company-meta-pill {
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:7px 10px;
          border-radius:999px;
          background:#f8fafc;
          border:1px solid #edf0f3;
          color:#66707f;
          font-size:10px;
          font-weight:700;
          text-transform:capitalize;
        }

        .pub-company-status-label {
          color:rgba(255,255,255,.42);
          text-transform:uppercase;
          letter-spacing:.07em;
          font-size:10px;
          font-weight:700;
          margin-bottom:9px;
        }

        .pub-company-status-value {
          font-size:22px;
          font-weight:800;
          letter-spacing:-.035em;
          margin-bottom:8px;
          text-transform:capitalize;
        }

        .pub-company-status-copy {
          color:rgba(255,255,255,.46);
          font-size:11px;
          line-height:1.65;
          margin-bottom:20px;
        }

        .pub-company-next {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding-top:17px;
          border-top:1px solid rgba(255,255,255,.09);
          color:rgba(255,255,255,.72);
          font-size:10.5px;
          font-weight:600;
        }

        .pub-company-loading {
          width:100%;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          padding:34px;
          box-shadow:0 18px 48px rgba(15,23,42,.05);
        }

        @media(max-width:860px){
          .pub-company-summary{grid-template-columns:1fr}
        }

        @media(max-width:560px){
          .pub-company-create{padding:26px 20px}
          .pub-company-form{flex-direction:column;align-items:stretch}
          .pub-company-input{width:100%}
          .pub-company-form .pub-primary-btn{width:100%}
          .pub-company-main-card,.pub-company-status-card{padding:22px 20px}
          .pub-company-name{font-size:26px}
        }


        .pub-foundation-wrap {
          width:100%;
          margin:0;
        }

        .pub-foundation-card {
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          padding:28px;
          box-shadow:0 18px 48px rgba(15,23,42,.055);
        }

        .pub-foundation-head {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          margin-bottom:22px;
        }

        .pub-foundation-kicker {
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:6px 9px;
          border-radius:999px;
          background:#f5f6f8;
          border:1px solid #eceef1;
          color:#737c89;
          font-size:9px;
          font-weight:700;
          letter-spacing:.06em;
          text-transform:uppercase;
          margin-bottom:10px;
        }

        .pub-foundation-title {
          margin:0 0 6px;
          font-size:24px;
          line-height:1.15;
          font-weight:800;
          letter-spacing:-.04em;
          color:#111827;
        }

        .pub-foundation-copy {
          margin:0;
          max-width:670px;
          color:#8d96a3;
          font-size:11.5px;
          line-height:1.7;
        }

        .pub-foundation-form-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:14px;
        }

        .pub-foundation-field.full { grid-column:1 / -1; }

        .pub-foundation-field label {
          display:block;
          margin:0 0 7px 2px;
          color:#737c89;
          font-size:9.5px;
          font-weight:700;
          letter-spacing:.055em;
          text-transform:uppercase;
        }

        .pub-foundation-input,
        .pub-foundation-textarea {
          width:100%;
          border:1.5px solid #e4e7eb;
          background:#fafbfc;
          color:#111827;
          outline:none;
          font-family:inherit;
          font-size:12px;
          font-weight:400;
          transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
        }

        .pub-foundation-input {
          height:44px;
          border-radius:999px;
          padding:0 15px;
        }

        .pub-foundation-textarea {
          min-height:108px;
          border-radius:18px;
          resize:vertical;
          padding:13px 15px;
          line-height:1.65;
        }

        .pub-foundation-input:focus,
        .pub-foundation-textarea:focus {
          background:#fff;
          border-color:#111827;
          box-shadow:0 0 0 4px rgba(17,24,39,.05);
        }

        .pub-foundation-actions {
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:9px;
          margin-top:20px;
          padding-top:18px;
          border-top:1px solid #f0f1f3;
        }

        .pub-foundation-feedback {
          margin-bottom:14px;
          padding:10px 13px;
          border-radius:14px;
          font-size:10.5px;
          font-weight:600;
          line-height:1.55;
        }

        .pub-foundation-feedback.error {
          background:#fff5f5;
          border:1px solid #fee2e2;
          color:#b91c1c;
        }

        .pub-foundation-feedback.success {
          background:#f0fdf4;
          border:1px solid #dcfce7;
          color:#15803d;
        }

        .pub-resource-layout {
          display:grid;
          grid-template-columns:minmax(0,1fr) minmax(300px,.72fr);
          gap:16px;
          align-items:start;
        }

        .pub-resource-list {
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .pub-resource-empty {
          border:1px dashed #dfe3e8;
          background:#fafbfc;
          border-radius:20px;
          padding:28px 20px;
          text-align:center;
          color:#959da8;
          font-size:11px;
          line-height:1.65;
        }

        .pub-resource-item {
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:19px;
          padding:15px;
          box-shadow:0 8px 24px rgba(15,23,42,.035);
        }

        .pub-resource-item-top {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
        }

        .pub-resource-item-title {
          color:#111827;
          font-size:12px;
          font-weight:800;
          line-height:1.4;
          word-break:break-word;
        }

        .pub-resource-item-status {
          flex-shrink:0;
          padding:5px 8px;
          border-radius:999px;
          background:#f5f6f8;
          border:1px solid #eceef1;
          color:#7b8492;
          font-size:8.5px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.05em;
        }

        .pub-resource-item-copy {
          margin-top:6px;
          color:#9aa2ad;
          font-size:10px;
          line-height:1.55;
          max-height:48px;
          overflow:hidden;
        }

        .pub-resource-item-actions {
          display:flex;
          gap:7px;
          margin-top:12px;
          padding-top:11px;
          border-top:1px solid #f1f2f4;
        }

        .pub-mini-btn {
          height:30px;
          border-radius:999px;
          border:1px solid #e3e6ea;
          background:#fff;
          color:#66707f;
          display:inline-flex;
          align-items:center;
          gap:5px;
          padding:0 10px;
          font-family:inherit;
          font-size:9px;
          font-weight:700;
          cursor:pointer;
        }

        .pub-mini-btn:hover { background:#f7f8fa;color:#111827; }
        .pub-mini-btn.danger { color:#c24141; }
        .pub-mini-btn.danger:hover { background:#fff4f4; }

        .pub-resource-manager {
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          box-shadow:0 18px 48px rgba(15,23,42,.055);
          overflow:hidden;
        }

        .pub-resource-manager-head {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:18px;
          padding:26px 28px 22px;
          border-bottom:1px solid #eef0f3;
        }

        .pub-resource-table-shell {
          padding:0 28px 26px;
        }

        .pub-resource-table-scroll {
          width:100%;
          overflow-x:auto;
          border:1px solid #e8eaee;
          border-radius:18px;
        }

        .pub-resource-table {
          width:100%;
          min-width:840px;
          border-collapse:collapse;
          background:#fff;
        }

        .pub-resource-table th {
          padding:12px 14px;
          text-align:left;
          background:#f8fafc;
          border-bottom:1px solid #e8eaee;
          color:#7a8391;
          font-size:9px;
          font-weight:800;
          letter-spacing:.055em;
          text-transform:uppercase;
          white-space:nowrap;
        }

        .pub-resource-table td {
          padding:14px;
          border-bottom:1px solid #f0f1f3;
          vertical-align:middle;
          color:#4b5563;
          font-size:10.5px;
        }

        .pub-resource-table tbody tr:last-child td {
          border-bottom:none;
        }

        .pub-resource-table tbody tr {
          transition:background .16s ease;
        }

        .pub-resource-table tbody tr:hover {
          background:#fbfcfd;
        }

        .pub-resource-table-title {
          max-width:260px;
          color:#111827;
          font-size:11px;
          font-weight:800;
          line-height:1.45;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .pub-resource-table-detail {
          max-width:330px;
          color:#7e8794;
          line-height:1.5;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        .pub-resource-table-status {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding:5px 9px;
          border-radius:999px;
          border:1px solid #e5e7eb;
          background:#f8fafc;
          color:#6b7280;
          font-size:8.5px;
          font-weight:800;
          text-transform:capitalize;
          white-space:nowrap;
        }

        .pub-resource-table-status.published {
          background:#f0fdf4;
          border-color:#dcfce7;
          color:#15803d;
        }

        .pub-resource-table-status.pending {
          background:#fff7ed;
          border-color:#ffedd5;
          color:#c2410c;
        }

        .pub-resource-table-status.rejected {
          background:#fff5f5;
          border-color:#fee2e2;
          color:#b91c1c;
        }

        .pub-resource-table-status.draft {
          background:#f8fafc;
          border-color:#e5e7eb;
          color:#64748b;
        }

        .pub-resource-table-date {
          white-space:nowrap;
          color:#8d96a3!important;
        }

        .pub-resource-table-actions {
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:7px;
          white-space:nowrap;
        }

        .pub-resource-table-empty {
          min-height:250px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:7px;
          border:1px dashed #dfe3e8;
          border-radius:18px;
          background:#fafbfc;
          color:#959da8;
          font-size:10.5px;
          text-align:center;
        }

        .pub-resource-table-empty strong {
          color:#374151;
          font-size:12px;
          font-weight:800;
        }

        .pub-resource-table-empty span {
          max-width:360px;
          line-height:1.6;
        }

        .pub-resource-empty-icon {
          width:40px;
          height:40px;
          border-radius:13px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#fff;
          border:1px solid #e6e8ec;
          color:#6b7280;
          margin-bottom:3px;
        }

        .pub-resource-manager-footer {
          display:flex;
          justify-content:flex-end;
          padding:18px 28px 22px;
          border-top:1px solid #eef0f3;
          background:#fff;
        }

        .pub-resource-modal-overlay {
          position:fixed;
          inset:0;
          z-index:120;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px;
          background:rgba(15,23,42,.34);
          backdrop-filter:blur(9px);
        }

        .pub-resource-modal {
          width:min(760px,100%);
          max-height:min(86vh,860px);
          display:flex;
          flex-direction:column;
          overflow:hidden;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          box-shadow:0 32px 90px rgba(15,23,42,.20);
        }


        .pub-resource-modal.post-modal {
          width:min(1080px,calc(100vw - 48px));
          max-height:min(92vh,940px);
        }

        .pub-resource-modal.post-modal .pub-resource-modal-copy {
          max-width:760px;
        }

        .pub-rich-editor-shell {
          overflow:hidden;
          border:1.5px solid #e4e7eb;
          border-radius:18px;
          background:#fff;
          transition:border-color .18s ease,box-shadow .18s ease;
        }

        .pub-rich-editor-shell:focus-within {
          border-color:#111827;
          box-shadow:0 0 0 4px rgba(17,24,39,.05);
        }

        .pub-rich-editor-shell.disabled {
          opacity:.62;
          background:#f8fafc;
        }

        .pub-rich-toolbar {
          min-height:45px;
          display:flex;
          align-items:center;
          flex-wrap:wrap;
          gap:8px;
          padding:7px 9px;
          border-bottom:1px solid #eceef1;
          background:#f8fafc;
        }

        .pub-rich-toolbar-group {
          display:flex;
          align-items:center;
          gap:5px;
        }

        .pub-rich-toolbar-divider {
          width:1px;
          height:23px;
          background:#dfe3e8;
        }

        .pub-rich-tool {
          min-width:31px;
          height:31px;
          border:1px solid #e2e5e9;
          border-radius:9px;
          background:#fff;
          color:#596273;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:5px;
          padding:0 8px;
          font-family:inherit;
          font-size:9px;
          font-weight:800;
          cursor:pointer;
          transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease;
        }

        .pub-rich-tool:hover:not(:disabled) {
          background:#111827;
          border-color:#111827;
          color:#fff;
          transform:translateY(-1px);
        }

        .pub-rich-tool.text {
          min-width:36px;
        }

        .pub-rich-tool:disabled {
          cursor:not-allowed;
          opacity:.45;
        }

        .pub-rich-editor {
          min-height:270px;
          max-height:460px;
          overflow-y:auto;
          padding:18px 19px 24px;
          outline:none;
          color:#1f2937;
          font-family:inherit;
          font-size:13px;
          line-height:1.8;
          word-break:break-word;
        }

        .pub-rich-editor:empty::before {
          content:attr(data-placeholder);
          color:#b0b7c1;
          pointer-events:none;
        }

        .pub-rich-editor p {
          margin:0 0 14px;
        }

        .pub-rich-editor h1 {
          margin:24px 0 12px;
          font-size:28px;
          line-height:1.2;
          font-weight:800;
          letter-spacing:-.035em;
          color:#111827;
        }

        .pub-rich-editor h2 {
          margin:22px 0 10px;
          font-size:22px;
          line-height:1.25;
          font-weight:800;
          letter-spacing:-.025em;
          color:#111827;
        }

        .pub-rich-editor h3 {
          margin:20px 0 9px;
          font-size:17px;
          line-height:1.3;
          font-weight:800;
          color:#111827;
        }

        .pub-rich-editor blockquote {
          margin:18px 0;
          padding:14px 16px;
          border-left:3px solid #2563eb;
          border-radius:0 14px 14px 0;
          background:#f8fafc;
          color:#536072;
          font-style:italic;
          line-height:1.75;
        }

        .pub-rich-editor img {
          display:block;
          width:min(100%,760px);
          height:auto;
          max-height:520px;
          object-fit:contain;
          margin:22px auto;
          border-radius:16px;
          border:1px solid #e5e9ef;
          background:#f4f6f8;
          box-shadow:0 10px 26px rgba(15,23,42,.07);
          cursor:grab;
        }

        .pub-rich-editor img:active {
          cursor:grabbing;
        }

        .pub-rich-editor-shell.dragging-image {
          border-color:#2563eb;
          box-shadow:
            0 0 0 4px rgba(37,99,235,.10),
            0 16px 36px rgba(37,99,235,.10);
        }

        .pub-rich-editor-shell.dragging-image .pub-rich-editor {
          background:#f8fbff;
        }

        .pub-rich-image-input {
          position:absolute;
          width:1px;
          height:1px;
          opacity:0;
          pointer-events:none;
        }

        .pub-rich-media-count {
          margin-left:auto;
          min-width:42px;
          height:25px;
          padding:0 8px;
          border-radius:999px;
          border:1px solid #dbeafe;
          background:#eff6ff;
          color:#2563eb;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:8.5px;
          font-weight:800;
          font-variant-numeric:tabular-nums;
        }

        .pub-rich-upload-progress {
          padding:8px 10px;
          display:flex;
          align-items:center;
          gap:9px;
          border-bottom:1px solid #e8edf5;
          background:#f8fbff;
          color:#2563eb;
          font-size:9px;
          font-weight:800;
        }


        .pub-rich-editor ul,
        .pub-rich-editor ol {
          margin:10px 0 14px 24px;
          padding-left:16px;
        }

        .pub-rich-editor ul {
          list-style-type:disc;
        }

        .pub-rich-editor ol {
          list-style-type:decimal;
        }

        .pub-rich-editor li {
          margin:5px 0;
          padding-left:2px;
        }

        .pub-rich-media-error {
          padding:8px 11px;
          border-bottom:1px solid #fee2e2;
          background:#fff5f5;
          color:#b91c1c;
          font-size:9px;
          font-weight:700;
          line-height:1.45;
        }


        .pub-product-features {
          border:1.5px solid #e4e7eb;
          border-radius:18px;
          background:#fafbfc;
          padding:12px;
          transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
        }

        .pub-product-features:focus-within {
          border-color:#111827;
          background:#fff;
          box-shadow:0 0 0 4px rgba(17,24,39,.05);
        }

        .pub-product-feature-entry {
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:8px;
          align-items:center;
        }

        .pub-product-feature-entry .pub-foundation-input {
          background:#fff;
        }

        .pub-product-feature-add {
          height:44px;
          padding:0 14px;
          border:1px solid #111827;
          border-radius:999px;
          background:#111827;
          color:#fff;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          font-family:inherit;
          font-size:9.5px;
          font-weight:800;
          cursor:pointer;
          white-space:nowrap;
          transition:transform .16s ease,opacity .16s ease,background .16s ease;
        }

        .pub-product-feature-add:hover:not(:disabled) {
          background:#000;
          transform:translateY(-1px);
        }

        .pub-product-feature-add:disabled {
          opacity:.42;
          cursor:not-allowed;
        }

        .pub-product-feature-note {
          margin:8px 2px 0;
          color:#9aa2ad;
          font-size:9px;
          line-height:1.5;
        }

        .pub-product-feature-list {
          display:flex;
          flex-wrap:wrap;
          gap:7px;
          margin-top:12px;
          padding-top:12px;
          border-top:1px solid #eceef1;
        }

        .pub-product-feature-pill {
          min-height:30px;
          padding:0 7px 0 11px;
          border-radius:999px;
          border:1px solid #dde2e8;
          background:#fff;
          color:#4f5866;
          display:inline-flex;
          align-items:center;
          gap:7px;
          font-size:9px;
          font-weight:700;
          line-height:1.25;
        }

        .pub-product-feature-pill button {
          width:20px;
          height:20px;
          border:0;
          border-radius:50%;
          background:#f3f4f6;
          color:#7b8492;
          display:flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          padding:0;
        }

        .pub-product-feature-pill button:hover:not(:disabled) {
          background:#fee2e2;
          color:#b91c1c;
        }

        .pub-product-feature-pill button:disabled {
          cursor:not-allowed;
          opacity:.5;
        }

        @media(max-width:600px){
          .pub-product-feature-entry{grid-template-columns:1fr}
          .pub-product-feature-add{width:100%}
        }

        .pub-resource-modal-head {
          flex-shrink:0;
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:18px;
          padding:24px 26px 18px;
          border-bottom:1px solid #eef0f3;
        }

        .pub-resource-modal-title {
          margin:0 0 6px;
          color:#111827;
          font-size:22px;
          font-weight:800;
          letter-spacing:-.035em;
        }

        .pub-resource-modal-copy {
          margin:0;
          max-width:590px;
          color:#8d96a3;
          font-size:10.5px;
          line-height:1.65;
        }

        .pub-resource-modal-close {
          width:34px;
          height:34px;
          flex-shrink:0;
          border-radius:999px;
          border:1px solid #e5e7eb;
          background:#fff;
          color:#697280;
          display:flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
          transition:background .16s ease,color .16s ease,transform .16s ease;
        }

        .pub-resource-modal-close:hover:not(:disabled) {
          background:#f6f7f9;
          color:#111827;
          transform:scale(1.03);
        }

        .pub-resource-modal-close:disabled {
          opacity:.5;
          cursor:not-allowed;
        }

        .pub-resource-modal-body {
          flex:1;
          min-height:0;
          overflow-y:auto;
          padding:22px 26px 24px;
          scrollbar-width:thin;
          scrollbar-color:#d7dbe1 transparent;
        }

        .pub-resource-modal-foot {
          flex-shrink:0;
          display:flex;
          justify-content:flex-end;
          gap:9px;
          padding:16px 26px;
          border-top:1px solid #eef0f3;
          background:#fff;
        }

        @media(max-width:700px){
          .pub-resource-manager-head{
            flex-direction:column;
            align-items:stretch;
            padding:22px 18px 18px;
          }
          .pub-resource-manager-head .pub-primary-btn{
            width:100%;
          }
          .pub-resource-table-shell{padding:0 18px 20px}
          .pub-resource-manager-footer{padding:16px 18px 20px}
          .pub-resource-modal-overlay{padding:12px}
          .pub-resource-modal{max-height:92vh;border-radius:22px}
          .pub-resource-modal.post-modal{width:100%;max-height:94vh}
          .pub-rich-toolbar{gap:6px}
          .pub-rich-toolbar-divider{display:none}
          .pub-rich-editor{min-height:230px;padding:15px}
          .pub-resource-modal-head{padding:20px 18px 16px}
          .pub-resource-modal-body{padding:18px}
          .pub-resource-modal-foot{padding:14px 18px}
          .pub-resource-modal-foot .pub-primary-btn,
          .pub-resource-modal-foot .pub-secondary-btn{flex:1}
        }


        .pub-mini-btn.responses {
          border-color:#dbeafe;
          background:#eff6ff;
          color:#2563eb;
        }

        .pub-mini-btn.responses:hover {
          background:#dbeafe;
          color:#1d4ed8;
        }

        .pub-responses-modal {
          width:min(1180px,calc(100vw - 48px));
          max-height:min(90vh,900px);
          display:flex;
          flex-direction:column;
          overflow:hidden;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          box-shadow:0 32px 90px rgba(15,23,42,.20);
        }

        .pub-responses-body {
          flex:1;
          min-height:0;
          overflow:auto;
          padding:20px 24px 26px;
        }

        .pub-responses-count {
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:6px 9px;
          margin-bottom:14px;
          border-radius:999px;
          background:#eff6ff;
          border:1px solid #dbeafe;
          color:#2563eb;
          font-size:9px;
          font-weight:800;
        }

        .pub-responses-table-wrap {
          width:100%;
          overflow-x:auto;
          border:1px solid #e8eaee;
          border-radius:16px;
        }

        .pub-responses-table {
          width:100%;
          min-width:1060px;
          border-collapse:collapse;
          background:#fff;
        }

        .pub-responses-table th {
          padding:11px 12px;
          text-align:left;
          background:#f8fafc;
          border-bottom:1px solid #e8eaee;
          color:#7a8391;
          font-size:8.5px;
          font-weight:800;
          letter-spacing:.05em;
          text-transform:uppercase;
          white-space:nowrap;
        }

        .pub-responses-table td {
          padding:12px;
          border-bottom:1px solid #f0f1f3;
          color:#4b5563;
          font-size:10px;
          line-height:1.5;
          vertical-align:middle;
        }

        .pub-response-message-btn {
          width:30px;
          height:30px;
          border-radius:999px;
          border:1px solid #e3e6ea;
          background:#fff;
          color:#66707f;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          cursor:pointer;
        }

        .pub-response-message-btn.open svg {
          transform:rotate(180deg);
        }

        .pub-response-message-btn svg {
          transition:transform .18s ease;
        }

        .pub-response-expanded td {
          padding:0!important;
          background:#fbfcfd;
        }

        .pub-response-message-panel {
          padding:16px 18px 18px;
          border-top:1px solid #eef0f3;
        }

        .pub-response-message-label {
          display:flex;
          align-items:center;
          gap:6px;
          color:#6b7280;
          font-size:8.5px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.055em;
          margin-bottom:7px;
        }

        .pub-response-message-copy {
          color:#374151;
          font-size:10.5px;
          line-height:1.7;
          white-space:pre-wrap;
          word-break:break-word;
        }

        .pub-responses-empty {
          min-height:220px;
          border:1px dashed #dfe3e8;
          border-radius:16px;
          background:#fafbfc;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
          color:#929aa6;
          font-size:10.5px;
          padding:24px;
        }

        @media(max-width:700px){
          .pub-responses-modal{width:100%;max-height:94vh}
          .pub-responses-body{padding:16px}
        }

        .pub-preview-grid {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:10px;
          margin:20px 0;
        }

        .pub-preview-stat {
          background:#f8fafc;
          border:1px solid #edf0f3;
          border-radius:18px;
          padding:15px;
        }

        .pub-preview-stat-value {
          font-size:22px;
          font-weight:800;
          letter-spacing:-.035em;
          color:#111827;
        }

        .pub-preview-stat-label {
          margin-top:4px;
          color:#8d96a3;
          font-size:9px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.05em;
        }

        .pub-review-panel {
          margin-top:16px;
          border-radius:22px;
          background:#111827;
          color:#fff;
          padding:22px;
        }

        .pub-review-state {
          font-size:20px;
          font-weight:800;
          text-transform:capitalize;
          letter-spacing:-.03em;
          margin-bottom:7px;
        }

        .pub-review-copy {
          color:rgba(255,255,255,.48);
          font-size:10.5px;
          line-height:1.65;
          max-width:680px;
          margin-bottom:17px;
        }

        .pub-review-panel .pub-primary-btn {
          background:#fff;
          border-color:#fff;
          color:#111827;
          box-shadow:none;
        }

        .pub-review-panel .pub-primary-btn:hover {
          background:#f4f5f7;
        }

        @media(max-width:900px){
          .pub-resource-layout{grid-template-columns:1fr}
          .pub-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }

        @media(max-width:620px){
          .pub-foundation-card{padding:22px 18px}
          .pub-foundation-form-grid{grid-template-columns:1fr}
          .pub-foundation-field.full{grid-column:auto}
          .pub-foundation-head{flex-direction:column}
          .pub-foundation-actions{justify-content:stretch}
          .pub-foundation-actions .pub-primary-btn,
          .pub-foundation-actions .pub-secondary-btn{flex:1}
          .pub-preview-grid{grid-template-columns:1fr 1fr}
        }

        .pub-placeholder {
          min-height:calc(100vh - 120px);
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .pub-placeholder-card {
          width:min(520px,100%);
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          padding:34px;
          text-align:center;
          box-shadow:0 14px 40px rgba(15,23,42,.05);
        }

        .pub-placeholder-icon {
          width:50px;height:50px;border-radius:17px;
          display:flex;align-items:center;justify-content:center;
          background:#f5f6f8;border:1px solid #e9ebef;color:#68717f;
          margin:0 auto 18px;
        }

        .pub-placeholder-title {
          margin:0 0 8px;
          font-size:20px;
          font-weight:800;
          letter-spacing:-.035em;
          color:#111827;
        }

        .pub-placeholder-copy {
          margin:0 auto;
          max-width:370px;
          color:#8c95a2;
          font-size:12px;
          line-height:1.7;
        }

        .pub-backdrop {
          position:fixed;inset:0;background:#0f172a;z-index:40;
        }

        .pub-modal-overlay {
          position:fixed;
          inset:0;
          z-index:80;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:20px;
          background:rgba(15,23,42,.3);
          backdrop-filter:blur(9px);
        }

        .pub-modal {
          width:min(390px,100%);
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:24px;
          padding:27px;
          text-align:center;
          box-shadow:0 28px 80px rgba(15,23,42,.16);
        }

        .pub-modal-icon {
          width:46px;height:46px;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 16px;
          background:#fff2f2;
          color:#dc2626;
        }

        .pub-modal-title {
          margin:0 0 6px;
          font-size:17px;
          font-weight:800;
          letter-spacing:-.025em;
        }

        .pub-modal-copy {
          margin:0 0 21px;
          color:#939ba7;
          font-size:11px;
          line-height:1.65;
        }

        .pub-modal-actions{display:flex;justify-content:center;gap:9px}

        @media(max-width:980px){
          .pub-hero{grid-template-columns:1fr}
          .pub-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }

        @media(max-width:767px){
          .pub-sidebar{
            position:fixed;
            left:0;
            top:0;
            width:246px!important;
            transform:translateX(-100%);
          }
          .pub-sidebar.mobile-open{transform:translateX(0)}
          .pub-mobile-menu{display:flex}
          .pub-topbar{padding:0 16px}
          .pub-content{padding:18px 16px}
          .pub-status-pill{display:none}
        }

        @media(max-width:560px){
          .pub-grid{grid-template-columns:1fr}
          .pub-hero-card{padding:24px 20px}
          .pub-side-card{padding:22px 20px}
          .pub-heading{font-size:30px}
        }
      `}</style>

      <div className="pub-root">
        <AnimatePresence>
          {mobileSidebarOpen && (
            <motion.div
              className="pub-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: .28 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <aside
          className={`pub-sidebar ${sidebarCollapsed ? "closed" : "open"} ${
            mobileSidebarOpen ? "mobile-open" : ""
          }`}
        >
          <div className="pub-side-head">
            {!sidebarCollapsed && (
              <div className="pub-profile">
                <div className="pub-avatar">{initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="pub-profile-name">{displayName}</div>
                  <div className="pub-profile-role">Publisher</div>
                </div>
              </div>
            )}

            {sidebarCollapsed && <div style={{ flex: 1 }} />}

            <button
              className="pub-collapse hidden md:flex"
              onClick={() => setSidebarCollapsed((value) => !value)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={14} />
              ) : (
                <PanelLeftClose size={14} />
              )}
            </button>
          </div>

          <nav className="pub-nav">
            {navItems.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`pub-nav-btn ${activeMenu === key ? "active" : ""} ${
                  sidebarCollapsed ? "col" : ""
                }`}
                onClick={() => goTo(key)}
                title={sidebarCollapsed ? label : undefined}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && <span>{label}</span>}
              </button>
            ))}
          </nav>

          <div className="pub-side-foot">
            <button
              className={`pub-logout ${sidebarCollapsed ? "col" : ""}`}
              onClick={() => {
                setMobileSidebarOpen(false);
                setShowLogoutModal(true);
              }}
              title={sidebarCollapsed ? "Logout" : undefined}
            >
              <LogOut size={15} />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        <main className="pub-main">
          <header className="pub-topbar">
            <div className="pub-topbar-left">
              <button
                className="pub-mobile-menu"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open publisher navigation"
              >
                <Menu size={17} />
              </button>
              <div className="pub-page-title">{PAGE_TITLES[activeMenu]}</div>
            </div>

            <div className={`pub-status-pill ${sessionRemainingSeconds <= 300 ? "expiring" : ""}`} title="Publisher session time remaining">
              <Clock3 size={13} />
              <span className="pub-session-clock">
                {formatSessionCountdown(sessionRemainingSeconds)}
              </span>
            </div>
          </header>

          <section className="pub-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeMenu}
                className="pub-page-wrap"
                initial={{ opacity: 0, y: 9 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -7 }}
                transition={{ duration: .22, ease: [0.22, 1, 0.36, 1] }}
              >
                {currentCompany && (
                  <AnimatePresence mode="wait">
                    {needsRevision && (
                      <motion.div
                        className="pub-workflow-banner revision"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                      >
                        <div className="pub-workflow-banner-icon"><RotateCcw size={15} /></div>
                        <div className="pub-workflow-banner-content">
                          <div className="pub-workflow-banner-title">Revision requested by admin</div>
                          <div className="pub-workflow-banner-copy">
                            {currentCompany.revisionNote || "Please review the profile, make the requested changes and resubmit it for approval."}
                          </div>
                        </div>
                        <button className="pub-workflow-banner-action" onClick={() => goTo("submit")}>
                          Review & Resubmit
                        </button>
                      </motion.div>
                    )}

                    {isRejected && (
                      <motion.div
                        className="pub-workflow-banner rejected"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                      >
                        <div className="pub-workflow-banner-icon"><Ban size={15} /></div>
                        <div className="pub-workflow-banner-content">
                          <div className="pub-workflow-banner-title">Profile was rejected</div>
                          <div className="pub-workflow-banner-copy">
                            {currentCompany.rejectionNote || "Review the profile, correct the issues and submit it again when ready."}
                          </div>
                        </div>
                        <button className="pub-workflow-banner-action" onClick={() => goTo("company")}>
                          Edit Profile
                        </button>
                      </motion.div>
                    )}

                    {editingLocked && (
                      <motion.div
                        className="pub-workflow-banner pending"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                      >
                        <div className="pub-workflow-banner-icon"><Clock3 size={15} /></div>
                        <div className="pub-workflow-banner-content">
                          <div className="pub-workflow-banner-title">Pending admin review</div>
                          <div className="pub-workflow-banner-copy">
                            Editing is temporarily locked while Matthias reviews this submission.
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {isApproved && (
                      <motion.div
                        className="pub-workflow-banner approved"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                      >
                        <div className="pub-workflow-banner-icon"><CircleCheck size={15} /></div>
                        <div className="pub-workflow-banner-content">
                          <div className="pub-workflow-banner-title">Profile approved and published</div>
                          <div className="pub-workflow-banner-copy">
                            Approved version {currentCompany.approvedVersion || 1} is live. New edits will start a fresh draft revision without replacing the last approved snapshot.
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {isUnpublished && (
                      <motion.div
                        className="pub-workflow-banner unpublished"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                      >
                        <div className="pub-workflow-banner-icon"><EyeOff size={15} /></div>
                        <div className="pub-workflow-banner-content">
                          <div className="pub-workflow-banner-title">Profile is currently unpublished</div>
                          <div className="pub-workflow-banner-copy">
                            {currentCompany.unpublishNote || "The administrator has taken this provider profile offline."}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {activeMenu === "overview" ? (
                  <>
                    <div className="pub-hero">
                      <div className="pub-hero-card">
                        <div className="pub-eyebrow">
                          <ShieldCheck size={12} />
                          Publisher Workspace
                        </div>

                        <h1 className="pub-heading">
                          Build your company presence, <span>one polished step at a time.</span>
                        </h1>

                        <p className="pub-body-copy">
                          Your workspace is ready. Start with the company profile, then add structured content and submit everything for editorial approval when it is ready.
                        </p>

                        <div className="pub-hero-actions">
                          <button
                            className="pub-primary-btn"
                            onClick={() => goTo("company")}
                          >
                            <Building2 size={14} />
                            Start Company Profile
                          </button>

                          <button
                            className="pub-secondary-btn"
                            onClick={() => goTo("submit")}
                          >
                            Preview Workflow
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="pub-side-card">
                        <div className="pub-side-icon">
                          <CheckCircle2 size={17} />
                        </div>

                        <div className="pub-side-label">Account Status</div>
                        <div className="pub-side-value">Ready to create</div>
                        <div className="pub-side-copy">
                          No company is assigned to your account. You will create and own your company profile from this workspace.
                        </div>
                      </div>
                    </div>

                    <div className="pub-grid">
                      {[
                        {
                          key: "company" as PublisherMenu,
                          title: "Company Profile",
                          copy: "Create the company identity, profile details and public-facing information.",
                          Icon: Building2,
                        },
                        {
                          key: "posts" as PublisherMenu,
                          title: "Posts",
                          copy: "Prepare editorial posts and updates linked to your company profile.",
                          Icon: Newspaper,
                        },
                        {
                          key: "whitepapers" as PublisherMenu,
                          title: "Whitepapers",
                          copy: "Organize long-form resources and downloadable company material.",
                          Icon: FileText,
                        },
                        {
                          key: "products" as PublisherMenu,
                          title: "Products",
                          copy: "Present products and structured commercial offerings clearly.",
                          Icon: Package,
                        },
                        {
                          key: "contacts" as PublisherMenu,
                          title: "Contacts",
                          copy: "Manage the people visitors can reach from the company profile.",
                          Icon: Users,
                        },
                        {
                          key: "submit" as PublisherMenu,
                          title: "Preview & Submit",
                          copy: "Review your work before sending it to the administrator for approval.",
                          Icon: Send,
                        },
                      ].map(({ key, title, copy, Icon }) => (
                        <motion.button
                          key={key}
                          className="pub-card"
                          onClick={() => goTo(key)}
                          whileTap={{ scale: .985 }}
                          style={{ textAlign: "left", fontFamily: "inherit" }}
                        >
                          <div className="pub-card-icon">
                            <Icon size={16} />
                          </div>
                          <div className="pub-card-title">
                            <span>{title}</span>
                            <ChevronRight size={14} color="#a3aab4" />
                          </div>
                          <div className="pub-card-copy">{copy}</div>
                        </motion.button>
                      ))}
                    </div>
                  </>
                ) : activeMenu === "company" ? (
                  <div className="pub-company-shell">
                    <AnimatePresence mode="wait">
                      {companiesLoading ? (
                        <motion.div
                          key="company-loading"
                          className="pub-company-loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <div className="pub-shimmer" style={{ width: 46, height: 46, borderRadius: 15, marginBottom: 18 }} />
                          <div className="pub-shimmer" style={{ width: "44%", height: 21, marginBottom: 11 }} />
                          <div className="pub-shimmer" style={{ width: "78%", height: 10, marginBottom: 8 }} />
                          <div className="pub-shimmer" style={{ width: "62%", height: 10 }} />
                        </motion.div>
                      ) : companies.length === 0 ? (
                        <motion.div
                          key="company-create"
                          className="pub-company-create"
                          initial={{ opacity: 0, y: 12, scale: .99 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: .26, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className="pub-company-create-icon">
                            <Building2 size={20} />
                          </div>

                          <h2 className="pub-company-create-title">Create your company profile</h2>
                          <p className="pub-company-create-copy">
                            Start with the company name. Your account will automatically become the owner of this profile, and the profile will remain a private draft until it is ready for editorial review.
                          </p>

                          {companyError && (
                            <motion.div
                              className="pub-company-error"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                            >
                              {companyError}
                            </motion.div>
                          )}

                          <div className="pub-company-form">
                            <input
                              className="pub-company-input"
                              value={companyName}
                              onChange={(e) => setCompanyName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !companyCreating) {
                                  handleCreateCompany();
                                }
                              }}
                              placeholder="Enter company name"
                              maxLength={160}
                              disabled={companyCreating}
                              autoFocus
                            />

                            <button
                              className="pub-primary-btn"
                              onClick={handleCreateCompany}
                              disabled={companyCreating}
                            >
                              {companyCreating ? (
                                <>
                                  <span className="pub-spinner" />
                                  Creating…
                                </>
                              ) : (
                                <>
                                  <Plus size={14} />
                                  Create Company
                                </>
                              )}
                            </button>
                          </div>

                          <div className="pub-company-note">
                            <ShieldCheck size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                            Ownership is assigned securely by the server from your authenticated Publisher account. It cannot be selected or changed from this form.
                          </div>
                        </motion.div>
                      ) : companyDetailsLoading ? (
                        <motion.div
                          key="company-details-loading"
                          className="pub-company-loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <div className="pub-shimmer" style={{ width: "34%", height: 22, marginBottom: 14 }} />
                          <div className="pub-shimmer" style={{ width: "76%", height: 11, marginBottom: 24 }} />
                          <div className="pub-shimmer" style={{ width: "100%", height: 46, marginBottom: 14 }} />
                          <div className="pub-shimmer" style={{ width: "100%", height: 110, borderRadius: 18 }} />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="company-editor"
                          className="pub-company-editor"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: .26, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className="pub-company-editor-main">
                            <div className="pub-company-editor-head">
                              <div>
                                <div className="pub-company-badge">
                                  <PencilLine size={12} />
                                  Draft profile
                                </div>
                                <h2 className="pub-company-editor-title">Company details</h2>
                                <p className="pub-company-editor-copy">
                                  Add the core information that will later appear on the public company profile. Everything here remains a private draft until you submit it for review.
                                </p>
                              </div>

                              {companySaveSuccess && (
                                <motion.div
                                  className="pub-company-save-status"
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                >
                                  <CheckCircle2 size={12} />
                                  {companySaveSuccess}
                                </motion.div>
                              )}
                            </div>

                            {companyError && (
                              <motion.div
                                className="pub-company-error"
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                              >
                                {companyError}
                              </motion.div>
                            )}

                            {editingLocked && (
                              <div className="pub-edit-lock-note">
                                This submitted profile is read-only until the administrator completes the review.
                              </div>
                            )}

                            <div className="pub-media-section">
                              <div className="pub-media-section-head">
                                <div>
                                  <div className="pub-media-section-title">
                                    <ImagePlus size={15} />
                                    Company media
                                  </div>
                                  <div className="pub-media-section-copy">
                                    Add your company logo and profile banner. JPG, PNG and WEBP images are supported.
                                  </div>
                                </div>

                                {(logoFile || bannerFile) && (
                                  <div className="pub-media-pending-pill">
                                    <UploadCloud size={11} />
                                    Local preview only
                                  </div>
                                )}
                              </div>

                              <div className="pub-media-grid">
                                <div className="pub-media-card">
                                  <div className="pub-media-label">Company Logo</div>
                                  <label
                                    className="pub-media-drop logo"
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      event.currentTarget.classList.add("dragging");
                                    }}
                                    onDragLeave={(event) => {
                                      event.currentTarget.classList.remove("dragging");
                                    }}
                                    onDrop={(event) => handleMediaDrop(event, "logo")}
                                  >
                                    <input
                                      className="pub-media-input"
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      onChange={(event) =>
                                        handleMediaSelection(event.target.files?.[0] || null, "logo")
                                      }
                                      disabled={editingLocked}
                                    />

                                    {logoPreview ? (
                                      <div className="pub-media-preview logo">
                                        <img src={logoPreview} alt="Company logo preview" />
                                        <div className="pub-media-overlay">
                                          <span className="pub-media-action">
                                            <RefreshCw size={10} />
                                            Replace
                                          </span>
                                          {logoFile && (
                                            <button
                                              type="button"
                                              className="pub-media-action"
                                              onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                clearSelectedMedia("logo");
                                              }}
                                            >
                                              <Trash2 size={10} />
                                              Undo
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="pub-media-empty">
                                        <div className="pub-media-empty-icon">
                                          <UploadCloud size={17} />
                                        </div>
                                        <div className="pub-media-empty-title">Drop logo or click to browse</div>
                                        <div className="pub-media-empty-copy">JPG, PNG or WEBP · max 5 MB</div>
                                      </div>
                                    )}
                                  </label>

                                  {logoMediaError && (
                                    <div className="pub-media-error">{logoMediaError}</div>
                                  )}

                                  {logoFile && !logoMediaError && (
                                    <div className="pub-media-selected">
                                      Selected: {logoFile.name}
                                    </div>
                                  )}
                                  <div className="pub-media-upload-row">
                                    {logoFile && (
                                      <button
                                        type="button"
                                        className="pub-media-upload-btn"
                                        onClick={() => uploadCompanyMedia("logo")}
                                        disabled={editingLocked || companyMediaUploading !== null}
                                      >
                                        <UploadCloud size={10} />
                                        {companyMediaUploading === "logo"
                                          ? `Uploading ${mediaUploadProgress}%`
                                          : "Upload Logo"}
                                      </button>
                                    )}
                                    {!logoFile && currentCompany?.logoUrl && (
                                      <button
                                        type="button"
                                        className="pub-media-upload-btn secondary"
                                        onClick={() => removeCompanyMedia("logo")}
                                        disabled={editingLocked || companyMediaUploading !== null}
                                      >
                                        <Trash2 size={10} />
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                  {companyMediaUploading === "logo" && (
                                    <div className="pub-media-progress" aria-live="polite">
                                      <div className="pub-media-progress-track">
                                        <div
                                          className="pub-media-progress-fill"
                                          style={{ width: `${Math.max(0, Math.min(100, mediaUploadProgress))}%` }}
                                        />
                                      </div>
                                      <span className="pub-media-progress-value">
                                        {mediaUploadProgress}%
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="pub-media-card">
                                  <div className="pub-media-label">Company Banner</div>
                                  <label
                                    className="pub-media-drop banner"
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      event.currentTarget.classList.add("dragging");
                                    }}
                                    onDragLeave={(event) => {
                                      event.currentTarget.classList.remove("dragging");
                                    }}
                                    onDrop={(event) => handleMediaDrop(event, "banner")}
                                  >
                                    <input
                                      className="pub-media-input"
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      onChange={(event) =>
                                        handleMediaSelection(event.target.files?.[0] || null, "banner")
                                      }
                                      disabled={editingLocked}
                                    />

                                    {bannerPreview ? (
                                      <div className="pub-media-preview banner">
                                        <img src={bannerPreview} alt="Company banner preview" />
                                        <div className="pub-media-overlay">
                                          <span className="pub-media-action">
                                            <RefreshCw size={10} />
                                            Replace
                                          </span>
                                          {bannerFile && (
                                            <button
                                              type="button"
                                              className="pub-media-action"
                                              onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                clearSelectedMedia("banner");
                                              }}
                                            >
                                              <Trash2 size={10} />
                                              Undo
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="pub-media-empty">
                                        <div className="pub-media-empty-icon">
                                          <UploadCloud size={17} />
                                        </div>
                                        <div className="pub-media-empty-title">Drop banner or click to browse</div>
                                        <div className="pub-media-empty-copy">JPG, PNG or WEBP · max 5 MB</div>
                                      </div>
                                    )}
                                  </label>

                                  {bannerMediaError && (
                                    <div className="pub-media-error">{bannerMediaError}</div>
                                  )}

                                  {bannerFile && !bannerMediaError && (
                                    <div className="pub-media-selected">
                                      Selected: {bannerFile.name}
                                    </div>
                                  )}
                                  <div className="pub-media-upload-row">
                                    {bannerFile && (
                                      <button
                                        type="button"
                                        className="pub-media-upload-btn"
                                        onClick={() => uploadCompanyMedia("banner")}
                                        disabled={editingLocked || companyMediaUploading !== null}
                                      >
                                        <UploadCloud size={10} />
                                        {companyMediaUploading === "banner"
                                          ? `Uploading ${mediaUploadProgress}%`
                                          : "Upload Banner"}
                                      </button>
                                    )}
                                    {!bannerFile && currentCompany?.bannerUrl && (
                                      <button
                                        type="button"
                                        className="pub-media-upload-btn secondary"
                                        onClick={() => removeCompanyMedia("banner")}
                                        disabled={editingLocked || companyMediaUploading !== null}
                                      >
                                        <Trash2 size={10} />
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                  {companyMediaUploading === "banner" && (
                                    <div className="pub-media-progress" aria-live="polite">
                                      <div className="pub-media-progress-track">
                                        <div
                                          className="pub-media-progress-fill"
                                          style={{ width: `${Math.max(0, Math.min(100, mediaUploadProgress))}%` }}
                                        />
                                      </div>
                                      <span className="pub-media-progress-value">
                                        {mediaUploadProgress}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                            </div>

                            <div className="pub-company-fields">
                              <div className="pub-company-field full">
                                <label>
                                  <Building2 size={12} />
                                  Company Name
                                </label>
                                <input
                                  className="pub-company-control"
                                  value={companyForm.name}
                                  onChange={(e) =>
                                    setCompanyForm((current) => ({ ...current, name: e.target.value }))
                                  }
                                  placeholder="Company name"
                                  maxLength={160}
                                  disabled={companySaving || editingLocked}
                                />
                              </div>

                              <div className="pub-company-field full">
                                <label>
                                  <FileText size={12} />
                                  Short Description
                                </label>
                                <textarea
                                  className="pub-company-textarea"
                                  value={companyForm.shortDescription}
                                  onChange={(e) =>
                                    setCompanyForm((current) => ({ ...current, shortDescription: e.target.value }))
                                  }
                                  placeholder="Briefly describe what your company does..."
                                  maxLength={500}
                                  disabled={companySaving || editingLocked}
                                />
                                <div className="pub-company-count">
                                  {companyForm.shortDescription.length}/500
                                </div>
                              </div>

                              <div className="pub-company-field">
                                <label>
                                  <Globe2 size={12} />
                                  Website URL
                                </label>
                                <input
                                  className="pub-company-control"
                                  value={companyForm.websiteUrl}
                                  onChange={(e) =>
                                    setCompanyForm((current) => ({ ...current, websiteUrl: e.target.value }))
                                  }
                                  placeholder="https://company.com"
                                  maxLength={300}
                                  disabled={companySaving || editingLocked}
                                />
                              </div>

                              <div className="pub-company-field">
                                <label>
                                  <Mail size={12} />
                                  Company Email
                                </label>
                                <input
                                  className="pub-company-control"
                                  type="email"
                                  value={companyForm.email}
                                  onChange={(e) =>
                                    setCompanyForm((current) => ({ ...current, email: e.target.value }))
                                  }
                                  placeholder="contact@company.com"
                                  maxLength={254}
                                  disabled={companySaving || editingLocked}
                                />
                              </div>

                              <div className="pub-company-field">
                                <label>
                                  <Phone size={12} />
                                  Phone
                                </label>
                                <input
                                  className="pub-company-control"
                                  value={companyForm.phone}
                                  onChange={(e) =>
                                    setCompanyForm((current) => ({ ...current, phone: e.target.value }))
                                  }
                                  placeholder="+49 ..."
                                  maxLength={50}
                                  disabled={companySaving || editingLocked}
                                />
                              </div>

                              <div className="pub-company-field">
                                <label>
                                  <MapPin size={12} />
                                  Address
                                </label>
                                <input
                                  className="pub-company-control"
                                  value={companyForm.address}
                                  onChange={(e) =>
                                    setCompanyForm((current) => ({ ...current, address: e.target.value }))
                                  }
                                  placeholder="City, Country"
                                  maxLength={300}
                                  disabled={companySaving || editingLocked}
                                />
                              </div>

                              <div className="pub-company-field full">
                                <label>
                                  <Tags size={12} />
                                  Categories
                                </label>

                                <div
                                  className={`pub-category-multiselect ${
                                    editingLocked || companySaving ? "disabled" : ""
                                  }`}
                                  role="group"
                                  aria-label="Company categories"
                                >
                                  {COMPANY_CATEGORY_OPTIONS.map((option) => {
                                    const selected = normalizeSelectedCategories(
                                      companyForm.categoriesText
                                    ).some(
                                      (item) =>
                                        item.toLowerCase() === option.toLowerCase()
                                    );

                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        className={`pub-category-option ${
                                          selected ? "selected" : ""
                                        }`}
                                        onClick={() => toggleCompanyCategory(option)}
                                        disabled={companySaving || editingLocked}
                                        aria-pressed={selected}
                                      >
                                        {selected && <CheckCircle2 size={12} />}
                                        <span>{option}</span>
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="pub-company-field-note">
                                  Select one or more categories that best describe the company.
                                </div>
                              </div>
                            </div>

                            <div className="pub-company-editor-actions">
                              <button
                                className="pub-secondary-btn"
                                onClick={handleSaveCompanyDetails}
                                disabled={companySaving || editingLocked}
                              >
                                <Save size={14} />
                                {companySaving ? "Saving…" : "Save Draft"}
                              </button>

                              <button
                                className="pub-primary-btn"
                                onClick={handleCompanyNext}
                                disabled={companySaving || editingLocked}
                              >
                                {companySaving ? (
                                  <>
                                    <span className="pub-spinner" />
                                    Saving…
                                  </>
                                ) : (
                                  <>
                                    Next
                                    <ChevronRight size={14} />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <aside className="pub-company-editor-side">
                            <div className="pub-company-editor-side-label">Profile Status</div>
                            <h3 className="pub-company-editor-side-title">{companies[0].name}</h3>
                            <div className="pub-company-editor-side-copy">
                              {editingLocked
                                ? "This version is currently with the administrator and cannot be edited until the review is complete."
                                : currentCompany?.status === "published"
                                  ? "The last approved snapshot remains published. New edits are treated as a separate draft revision."
                                  : "Saving changes updates the private working draft. Nothing becomes public without administrator approval."}
                            </div>

                            <div className="pub-company-editor-list">
                              <div className="pub-company-editor-list-row">
                                <span>Status</span>
                                <span>{companies[0].status}</span>
                              </div>
                              <div className="pub-company-editor-list-row">
                                <span>Moderation</span>
                                <span>{companies[0].moderationState.replaceAll("_", " ")}</span>
                              </div>
                              <div className="pub-company-editor-list-row">
                                <span>Slug</span>
                                <span>/{companies[0].slug}</span>
                              </div>
                            </div>
                          </aside>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : activeMenu === "about" ? (
                  <div className="pub-foundation-wrap">
                    <div className="pub-foundation-card">
                      <div className="pub-foundation-head">
                        <div>
                          <div className="pub-foundation-kicker">
                            <FileText size={11} />
                            About profile
                          </div>
                          <h2 className="pub-foundation-title">Tell the company story</h2>
                          <p className="pub-foundation-copy">
                            This structured About content is stored separately from the core company record and will later power the public About tab.
                          </p>
                        </div>
                      </div>

                      {sectionError && <div className="pub-foundation-feedback error">{sectionError}</div>}
                      {sectionSuccess && <div className="pub-foundation-feedback success">{sectionSuccess}</div>}

                      {sectionLoading ? (
                        <div className="pub-company-loading" style={{ width: "100%", boxShadow: "none" }}>
                          <div className="pub-shimmer" style={{ width: "42%", height: 18, marginBottom: 14 }} />
                          <div className="pub-shimmer" style={{ width: "100%", height: 44, marginBottom: 12 }} />
                          <div className="pub-shimmer" style={{ width: "100%", height: 108, borderRadius: 18 }} />
                        </div>
                      ) : (
                        <>
                          <div className="pub-foundation-form-grid">
                            <div className="pub-foundation-field full">
                              <label>Headline</label>
                              <input className="pub-foundation-input" maxLength={180} value={aboutForm.headline}
                                onChange={(e) => setAboutForm((v) => ({ ...v, headline: e.target.value }))}
                                placeholder="A concise headline about the company" disabled={editingLocked} />
                            </div>

                            <div className="pub-foundation-field full">
                              <label>Overview</label>
                              <textarea className="pub-foundation-textarea" maxLength={4000} value={aboutForm.overview}
                                onChange={(e) => setAboutForm((v) => ({ ...v, overview: e.target.value }))}
                                placeholder="Introduce the company, its work and its market position..." disabled={editingLocked} />
                            </div>

                            <div className="pub-foundation-field full">
                              <label>Mission</label>
                              <textarea className="pub-foundation-textarea" maxLength={2000} value={aboutForm.mission}
                                onChange={(e) => setAboutForm((v) => ({ ...v, mission: e.target.value }))}
                                placeholder="Company mission..." disabled={editingLocked} />
                            </div>

                            <div className="pub-foundation-field full">
                              <label>Vision</label>
                              <textarea className="pub-foundation-textarea" maxLength={2000} value={aboutForm.vision}
                                onChange={(e) => setAboutForm((v) => ({ ...v, vision: e.target.value }))}
                                placeholder="Company vision..." disabled={editingLocked} />
                            </div>

                            <div className="pub-foundation-field">
                              <label>Founded Year</label>
                              <input className="pub-foundation-input" maxLength={20} value={aboutForm.foundedYear}
                                onChange={(e) => setAboutForm((v) => ({ ...v, foundedYear: e.target.value }))}
                                placeholder="e.g. 2018" disabled={editingLocked} />
                            </div>

                            <div className="pub-foundation-field">
                              <label>Employee Range</label>
                              <input className="pub-foundation-input" maxLength={80} value={aboutForm.employeeRange}
                                onChange={(e) => setAboutForm((v) => ({ ...v, employeeRange: e.target.value }))}
                                placeholder="e.g. 51–200" disabled={editingLocked} />
                            </div>

                            <div className="pub-foundation-field full">
                              <label>Headquarters</label>
                              <input className="pub-foundation-input" maxLength={200} value={aboutForm.headquarters}
                                onChange={(e) => setAboutForm((v) => ({ ...v, headquarters: e.target.value }))}
                                placeholder="City, Country" disabled={editingLocked} />
                            </div>

                            <div className="pub-foundation-field full">
                              <label>Specialties</label>
                              <input className="pub-foundation-input" value={aboutForm.specialtiesText}
                                onChange={(e) => setAboutForm((v) => ({ ...v, specialtiesText: e.target.value }))}
                                placeholder="AI, ERP, Cloud, Consulting" disabled={editingLocked} />
                              <div className="pub-company-field-note">Comma-separated · maximum 20 specialties.</div>
                            </div>
                          </div>

                          <div className="pub-foundation-actions">
                            <button
                              className="pub-secondary-btn"
                              onClick={saveAbout}
                              disabled={sectionSaving || editingLocked}
                            >
                              <Save size={14} />
                              {sectionSaving ? "Saving…" : "Save Draft"}
                            </button>

                            <button
                              className="pub-primary-btn"
                              onClick={handleAboutNext}
                              disabled={sectionSaving || editingLocked}
                            >
                              {sectionSaving ? (
                                <>
                                  <span className="pub-spinner" />
                                  Saving…
                                </>
                              ) : (
                                <>
                                  Next
                                  <ChevronRight size={14} />
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : isResourceMenu(activeMenu) ? (
                  <div className="pub-foundation-wrap">
                    <div className="pub-resource-manager">
                      <div className="pub-resource-manager-head">
                        <div>
                          <div className="pub-foundation-kicker">
                            <FileText size={11} />
                            Published content
                          </div>
                          <h2 className="pub-foundation-title">{RESOURCE_CONFIG[activeMenu].title}</h2>
                          <p className="pub-foundation-copy">
                            Manage the {RESOURCE_CONFIG[activeMenu].title.toLowerCase()} attached to this provider profile.
                          </p>
                        </div>

                        <button
                          className="pub-primary-btn"
                          onClick={() => openNewResourceModal(activeMenu)}
                          disabled={editingLocked}
                        >
                          <Plus size={14} />
                          Add {RESOURCE_CONFIG[activeMenu].singular}
                        </button>
                      </div>

                      {sectionSuccess && (
                        <motion.div
                          className="pub-foundation-feedback success"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          {sectionSuccess}
                        </motion.div>
                      )}

                      {!resourceModalOpen && sectionError && (
                        <div className="pub-foundation-feedback error">{sectionError}</div>
                      )}

                      <div className="pub-resource-table-shell">
                        {sectionLoading ? (
                          <div className="pub-resource-table-empty">
                            Loading {RESOURCE_CONFIG[activeMenu].title.toLowerCase()}…
                          </div>
                        ) : resourceItems[activeMenu].length === 0 ? (
                          <div className="pub-resource-table-empty">
                            <div className="pub-resource-empty-icon">
                              <FileText size={18} />
                            </div>
                            <strong>No {RESOURCE_CONFIG[activeMenu].title.toLowerCase()} yet</strong>
                            <span>
                              Use the Add {RESOURCE_CONFIG[activeMenu].singular} button to create the first entry.
                            </span>
                          </div>
                        ) : (
                          <div className="pub-resource-table-scroll">
                            <table className="pub-resource-table">
                              <thead>
                                <tr>
                                  <th>{RESOURCE_CONFIG[activeMenu].singular}</th>
                                  <th>Details</th>
                                  <th>Status</th>
                                  <th>Updated</th>
                                  <th aria-label="Actions" />
                                </tr>
                              </thead>
                              <tbody>
                                {resourceItems[activeMenu].map((item) => {
                                  const primaryValue = item[RESOURCE_CONFIG[activeMenu].primaryKey];
                                  const title =
                                    typeof primaryValue === "string" && primaryValue.trim()
                                      ? primaryValue
                                      : RESOURCE_CONFIG[activeMenu].singular;

                                  const detailValue =
                                    item.summary ||
                                    item.excerpt ||
                                    item.shortDescription ||
                                    item.jobTitle ||
                                    item.location ||
                                    item.speaker ||
                                    item.authors ||
                                    item.body ||
                                    item.notes;

                                  const detail =
                                    typeof detailValue === "string" && detailValue.trim()
                                      ? detailValue
                                      : "—";

                                  const status = String(item.status || "draft").replaceAll("_", " ");
                                  const statusClass =
                                    status === "published" || status === "approved"
                                      ? "published"
                                      : status === "rejected"
                                        ? "rejected"
                                        : status === "pending" || status === "pending review"
                                          ? "pending"
                                          : "draft";

                                  return (
                                    <tr key={item.id}>
                                      <td>
                                        <div className="pub-resource-table-title">{title}</div>
                                      </td>
                                      <td>
                                        <div className="pub-resource-table-detail">{detail}</div>
                                      </td>
                                      <td>
                                        <span className={`pub-resource-table-status ${statusClass}`}>
                                          {status}
                                        </span>
                                      </td>
                                      <td className="pub-resource-table-date">
                                        {formatResourceDate(item.updatedAt || item.createdAt)}
                                      </td>
                                      <td>
                                        <div className="pub-resource-table-actions">
                                          {activeMenu === "whitepapers" && (
                                            <button
                                              className="pub-mini-btn responses"
                                              onClick={() => void openWhitepaperResponses(item)}
                                            >
                                              <Users size={10} />
                                              Show Responses
                                            </button>
                                          )}
                                          {activeMenu === "webinars" && (
                                            <button
                                              className="pub-mini-btn responses"
                                              onClick={() => void openWebinarResponses(item)}
                                            >
                                              <Users size={10} />
                                              Show Responses
                                            </button>
                                          )}
                                          <button
                                            className="pub-mini-btn"
                                            onClick={() => editResource(activeMenu, item)}
                                            disabled={editingLocked}
                                          >
                                            <PencilLine size={10} />
                                            Edit
                                          </button>
                                          <button
                                            className="pub-mini-btn danger"
                                            onClick={() => deleteResource(activeMenu, item.id)}
                                            disabled={editingLocked}
                                          >
                                            <Trash2 size={10} />
                                            Delete
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="pub-resource-manager-footer">
                        <button
                          className="pub-primary-btn"
                          onClick={() => goToNextStep(activeMenu)}
                        >
                          Next
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {resourceModalOpen && (
                        <motion.div
                          className="pub-resource-modal-overlay"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onMouseDown={(event) => {
                            if (event.target === event.currentTarget) closeResourceModal();
                          }}
                        >
                          <motion.div
                            className={`pub-resource-modal ${
                              activeMenu === "posts" ||
                              activeMenu === "whitepapers" ||
                              activeMenu === "products" ||
                              activeMenu === "webinars"
                                ? "post-modal"
                                : ""
                            }`}
                            initial={{ opacity: 0, y: 18, scale: .985 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: .99 }}
                            transition={{ duration: .22, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <div className="pub-resource-modal-head">
                              <div>
                                <div className="pub-foundation-kicker">
                                  <PencilLine size={11} />
                                  {editingResourceId ? "Edit content" : "New content"}
                                </div>
                                <h3 className="pub-resource-modal-title">
                                  {editingResourceId ? "Edit" : "Add"} {RESOURCE_CONFIG[activeMenu].singular}
                                </h3>
                                <p className="pub-resource-modal-copy">
                                  {RESOURCE_CONFIG[activeMenu].intro}
                                </p>
                              </div>

                              <button
                                type="button"
                                className="pub-resource-modal-close"
                                onClick={closeResourceModal}
                                disabled={sectionSaving || resourceMediaUploading || postGalleryUploading}
                                aria-label="Close"
                              >
                                <X size={17} />
                              </button>
                            </div>

                            <div className="pub-resource-modal-body">
                              {sectionError && (
                                <div className="pub-foundation-feedback error">{sectionError}</div>
                              )}

                              <div className="pub-foundation-form-grid">
                                {RESOURCE_CONFIG[activeMenu].fields.map((field) => (
                                  <Fragment key={field.key}>
                                    <div
                                      className={`pub-foundation-field ${field.full ? "full" : ""}`}
                                    >
                                      <label>
                                        {field.label}
                                        {field.required ? " *" : ""}
                                      </label>

                                      {field.type === "richtext" &&
                                      (activeMenu === "posts" ||
                                        activeMenu === "whitepapers" ||
                                        activeMenu === "webinars") ? (
                                        <PostRichTextEditor
                                          value={resourceForm[field.key] || ""}
                                          placeholder={field.placeholder}
                                          disabled={sectionSaving || editingLocked}
                                          maxImages={15}
                                          allowImages={activeMenu === "posts"}
                                          onUploadImage={
                                            activeMenu === "posts"
                                              ? handlePostContentImageUpload
                                              : undefined
                                          }
                                          onChange={(nextValue) =>
                                            setResourceForm((current) => ({
                                              ...current,
                                              [field.key]: nextValue,
                                            }))
                                          }
                                        />
                                      ) : field.type === "textarea" ? (
                                        <textarea
                                          className="pub-foundation-textarea"
                                          value={resourceForm[field.key] || ""}
                                          maxLength={field.maxLength}
                                          onChange={(e) =>
                                            setResourceForm((current) => ({
                                              ...current,
                                              [field.key]: e.target.value,
                                            }))
                                          }
                                          placeholder={field.placeholder}
                                          disabled={sectionSaving || editingLocked}
                                        />
                                      ) : (
                                        <input
                                          className="pub-foundation-input"
                                          type={field.type || "text"}
                                          value={resourceForm[field.key] || ""}
                                          maxLength={field.maxLength}
                                          onChange={(e) =>
                                            setResourceForm((current) => ({
                                              ...current,
                                              [field.key]: e.target.value,
                                            }))
                                          }
                                          placeholder={field.placeholder}
                                          disabled={sectionSaving || editingLocked}
                                        />
                                      )}
                                    </div>

                                    {activeMenu === "posts" &&
                                      field.key === "excerpt" &&
                                      RESOURCE_CONFIG.posts.media && (
                                        <label
                                          className="pub-resource-media"
                                          style={{
                                            cursor:
                                              editingLocked ||
                                              sectionSaving ||
                                              resourceMediaUploading
                                                ? "not-allowed"
                                                : "pointer",
                                          }}
                                        >
                                          <div className="pub-resource-media-title">
                                            <UploadCloud size={12} />
                                            Post Banner
                                          </div>
                                          <div className="pub-resource-media-copy">
                                            Select an image and it will upload automatically.
                                            {" · "}
                                            {RESOURCE_CONFIG.posts.media.helper}
                                          </div>

                                          <input
                                            className="pub-media-input"
                                            type="file"
                                            accept={RESOURCE_CONFIG.posts.media.accept}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0] || null;
                                              e.currentTarget.value = "";
                                              void handlePostBannerSelection(file);
                                            }}
                                            disabled={
                                              editingLocked ||
                                              sectionSaving ||
                                              resourceMediaUploading
                                            }
                                          />

                                          <div className="pub-resource-file" aria-hidden="true">
                                            <span style={{ fontWeight: 700 }}>
                                              {resourceMediaUploading
                                                ? "Uploading banner…"
                                                : resourceMediaFile
                                                  ? resourceMediaFile.name
                                                  : "Choose banner image"}
                                            </span>
                                          </div>

                                          {resourceMediaUploading && (
                                            <div className="pub-media-progress" aria-live="polite">
                                              <div className="pub-media-progress-track">
                                                <div
                                                  className="pub-media-progress-fill"
                                                  style={{
                                                    width: `${Math.max(
                                                      0,
                                                      Math.min(100, mediaUploadProgress)
                                                    )}%`,
                                                  }}
                                                />
                                              </div>
                                              <span className="pub-media-progress-value">
                                                {mediaUploadProgress}%
                                              </span>
                                            </div>
                                          )}

                                          {postBannerPreview && !resourceMediaUploading && (
                                            <div className="pub-post-banner-preview">
                                              <img src={postBannerPreview} alt="Uploaded post banner" />
                                              <div className="pub-post-banner-preview-copy">
                                                <CircleCheck size={12} />
                                                <span>Banner uploaded</span>
                                              </div>
                                            </div>
                                          )}
                                        </label>
                                      )}
                                  </Fragment>
                                ))}

                                {activeMenu === "products" && (
                                  <div className="pub-foundation-field full">
                                    <label>Features</label>

                                    <div className="pub-product-features">
                                      <div className="pub-product-feature-entry">
                                        <input
                                          className="pub-foundation-input"
                                          type="text"
                                          value={productFeatureDraft}
                                          maxLength={100}
                                          placeholder="Type a feature and press Enter or Add"
                                          onChange={(event) =>
                                            setProductFeatureDraft(event.target.value)
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              addProductFeature();
                                            }
                                          }}
                                          disabled={sectionSaving || editingLocked}
                                        />

                                        <button
                                          type="button"
                                          className="pub-product-feature-add"
                                          onClick={addProductFeature}
                                          disabled={
                                            sectionSaving ||
                                            editingLocked ||
                                            !productFeatureDraft.trim() ||
                                            productFeatures.length >= 30
                                          }
                                        >
                                          <Plus size={12} />
                                          Add
                                        </button>
                                      </div>

                                      <div className="pub-product-feature-note">
                                        Add each feature separately. Up to 30 features.
                                      </div>

                                      {productFeatures.length > 0 && (
                                        <div className="pub-product-feature-list">
                                          {productFeatures.map((feature, index) => (
                                            <span
                                              className="pub-product-feature-pill"
                                              key={`${feature}-${index}`}
                                            >
                                              {feature}
                                              <button
                                                type="button"
                                                onClick={() => removeProductFeature(index)}
                                                disabled={sectionSaving || editingLocked}
                                                aria-label={`Remove ${feature}`}
                                              >
                                                <X size={10} />
                                              </button>
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {activeMenu !== "posts" &&
                                  activeMenu !== "whitepapers" &&
                                  activeMenu !== "webinars" &&
                                  RESOURCE_CONFIG[activeMenu].media && (
                                    <label
                                      className="pub-resource-media"
                                      style={{
                                        cursor:
                                          editingLocked || sectionSaving || resourceMediaUploading
                                            ? "not-allowed"
                                            : "pointer",
                                      }}
                                    >
                                      <div className="pub-resource-media-title">
                                        <UploadCloud size={12} />
                                        {RESOURCE_CONFIG[activeMenu].media!.label}
                                      </div>
                                      <div className="pub-resource-media-copy">
                                        {editingResourceId
                                          ? "Choose a new file only if you want to replace the currently attached media."
                                          : "Choose the media file to attach to this entry."}
                                        {" · "}
                                        {RESOURCE_CONFIG[activeMenu].media!.helper}
                                      </div>

                                      <input
                                        className="pub-media-input"
                                        type="file"
                                        accept={RESOURCE_CONFIG[activeMenu].media!.accept}
                                        onChange={(e) => {
                                          setResourceMediaFile(e.target.files?.[0] || null);
                                          e.currentTarget.value = "";
                                        }}
                                        disabled={
                                          editingLocked ||
                                          sectionSaving ||
                                          resourceMediaUploading
                                        }
                                      />

                                      <div className="pub-resource-file" aria-hidden="true">
                                        <span style={{ fontWeight: 700 }}>
                                          {resourceMediaFile ? "Replace selected file" : "Choose file"}
                                        </span>
                                        {resourceMediaFile && (
                                          <span style={{ marginLeft: 7 }}>
                                            {resourceMediaFile.name}
                                          </span>
                                        )}
                                      </div>

                                      {resourceMediaFile && (
                                        <div className="pub-media-selected">
                                          Selected: {resourceMediaFile.name}
                                        </div>
                                      )}

                                      {resourceMediaUploading && (
                                        <div className="pub-media-progress" aria-live="polite">
                                          <div className="pub-media-progress-track">
                                            <div
                                              className="pub-media-progress-fill"
                                              style={{
                                                width: `${Math.max(
                                                  0,
                                                  Math.min(100, mediaUploadProgress)
                                                )}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="pub-media-progress-value">
                                            {mediaUploadProgress}%
                                          </span>
                                        </div>
                                      )}
                                    </label>
                                  )}

                                {activeMenu === "whitepapers" &&
                                  RESOURCE_CONFIG.whitepapers.media && (
                                    <label
                                      className="pub-resource-media"
                                      style={{
                                        cursor:
                                          editingLocked ||
                                          sectionSaving ||
                                          resourceMediaUploading
                                            ? "not-allowed"
                                            : "pointer",
                                      }}
                                    >
                                      <div className="pub-resource-media-title">
                                        <UploadCloud size={12} />
                                        Whitepaper Image
                                      </div>

                                      <div className="pub-resource-media-copy">
                                        Select the whitepaper image and it will upload automatically.
                                        {" · "}
                                        {RESOURCE_CONFIG.whitepapers.media.helper}
                                      </div>

                                      <input
                                        className="pub-media-input"
                                        type="file"
                                        accept={RESOURCE_CONFIG.whitepapers.media.accept}
                                        onChange={(event) => {
                                          const file = event.currentTarget.files?.[0] || null;
                                          event.currentTarget.value = "";
                                          void handleWhitepaperImageSelection(file);
                                        }}
                                        disabled={
                                          editingLocked ||
                                          sectionSaving ||
                                          resourceMediaUploading
                                        }
                                      />

                                      <div className="pub-resource-file" aria-hidden="true">
                                        <span style={{ fontWeight: 700 }}>
                                          {whitepaperImagePreview
                                            ? "Replace whitepaper image"
                                            : "Choose whitepaper image"}
                                        </span>
                                      </div>

                                      {resourceMediaUploading && (
                                        <div className="pub-media-progress" aria-live="polite">
                                          <div className="pub-media-progress-track">
                                            <div
                                              className="pub-media-progress-fill"
                                              style={{
                                                width: `${Math.max(
                                                  0,
                                                  Math.min(100, mediaUploadProgress)
                                                )}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="pub-media-progress-value">
                                            {mediaUploadProgress}%
                                          </span>
                                        </div>
                                      )}

                                      {whitepaperImagePreview && (
                                        <div className="pub-post-banner-preview">
                                          <img
                                            src={whitepaperImagePreview}
                                            alt="Uploaded whitepaper image"
                                          />
                                          <div className="pub-post-banner-preview-copy">
                                            <CircleCheck size={11} />
                                            <span>Whitepaper image uploaded</span>
                                          </div>
                                        </div>
                                      )}
                                    </label>
                                  )}

                                {activeMenu === "webinars" && (
                                  <div className="pub-webinar-media-grid">
                                    <label
                                      className="pub-resource-media"
                                      style={{
                                        cursor:
                                          editingLocked ||
                                          sectionSaving ||
                                          resourceMediaUploading
                                            ? "not-allowed"
                                            : "pointer",
                                      }}
                                    >
                                      <div className="pub-resource-media-title">
                                        <UploadCloud size={12} />
                                        Banner Image
                                      </div>
                                      <div className="pub-resource-media-copy">
                                        Upload the hero/banner image for the webinar page.
                                        {" · "}JPG, PNG or WEBP · max 8 MB
                                      </div>

                                      <input
                                        className="pub-media-input"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={(event) => {
                                          const file = event.currentTarget.files?.[0] || null;
                                          event.currentTarget.value = "";
                                          void handleWebinarMediaSelection(file, "banner");
                                        }}
                                        disabled={
                                          editingLocked ||
                                          sectionSaving ||
                                          resourceMediaUploading
                                        }
                                      />

                                      <div className="pub-resource-file" aria-hidden="true">
                                        <span style={{ fontWeight: 700 }}>
                                          {webinarBannerPreview
                                            ? "Replace banner image"
                                            : "Choose banner image"}
                                        </span>
                                      </div>

                                      {resourceMediaUploading && (
                                        <div className="pub-media-progress" aria-live="polite">
                                          <div className="pub-media-progress-track">
                                            <div
                                              className="pub-media-progress-fill"
                                              style={{
                                                width: `${Math.max(
                                                  0,
                                                  Math.min(100, mediaUploadProgress)
                                                )}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="pub-media-progress-value">
                                            {mediaUploadProgress}%
                                          </span>
                                        </div>
                                      )}

                                      {webinarBannerPreview && (
                                        <div className="pub-post-banner-preview webinar-banner">
                                          <img
                                            src={webinarBannerPreview}
                                            alt="Uploaded webinar banner"
                                          />
                                          <div className="pub-post-banner-preview-copy">
                                            <CircleCheck size={11} />
                                            <span>Banner uploaded</span>
                                          </div>
                                        </div>
                                      )}
                                    </label>

                                    <label
                                      className="pub-resource-media"
                                      style={{
                                        cursor:
                                          editingLocked ||
                                          sectionSaving ||
                                          resourceMediaUploading
                                            ? "not-allowed"
                                            : "pointer",
                                      }}
                                    >
                                      <div className="pub-resource-media-title">
                                        <UserRound size={12} />
                                        Speaker Image
                                      </div>
                                      <div className="pub-resource-media-copy">
                                        Upload the speaker portrait shown below the webinar content.
                                        {" · "}JPG, PNG or WEBP · max 5 MB
                                      </div>

                                      <input
                                        className="pub-media-input"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={(event) => {
                                          const file = event.currentTarget.files?.[0] || null;
                                          event.currentTarget.value = "";
                                          void handleWebinarMediaSelection(file, "speaker");
                                        }}
                                        disabled={
                                          editingLocked ||
                                          sectionSaving ||
                                          resourceMediaUploading
                                        }
                                      />

                                      <div className="pub-resource-file" aria-hidden="true">
                                        <span style={{ fontWeight: 700 }}>
                                          {webinarSpeakerImagePreview
                                            ? "Replace speaker image"
                                            : "Choose speaker image"}
                                        </span>
                                      </div>

                                      {webinarSpeakerImagePreview && (
                                        <div className="pub-webinar-speaker-preview">
                                          <img
                                            src={webinarSpeakerImagePreview}
                                            alt="Uploaded speaker"
                                          />
                                          <div className="pub-post-banner-preview-copy">
                                            <CircleCheck size={11} />
                                            <span>Speaker image uploaded</span>
                                          </div>
                                        </div>
                                      )}
                                    </label>
                                  </div>
                                )}

                                {activeMenu === "posts" && (
                                  <div className="pub-post-video-embed">
                                    <div className="pub-resource-media-title">
                                      <Video size={12} />
                                      Video Embed Link
                                    </div>

                                    <div className="pub-resource-media-copy">
                                      Paste a YouTube, Vimeo, Loom, Dailymotion or Wistia video URL.
                                      The video preview loads automatically.
                                    </div>

                                    <input
                                      className="pub-foundation-input"
                                      type="url"
                                      value={resourceForm.videoEmbedUrl || ""}
                                      placeholder="https://www.youtube.com/watch?v=..."
                                      onChange={(event) =>
                                        setResourceForm((current) => ({
                                          ...current,
                                          videoEmbedUrl: event.target.value,
                                        }))
                                      }
                                      disabled={sectionSaving || editingLocked}
                                    />

                                    {(resourceForm.videoEmbedUrl || "").trim() && (
                                      getSafeVideoEmbedUrl(
                                        resourceForm.videoEmbedUrl || ""
                                      ) ? (
                                        <div className="pub-post-video-preview">
                                          <iframe
                                            src={getSafeVideoEmbedUrl(
                                              resourceForm.videoEmbedUrl || ""
                                            )}
                                            title="Video preview"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                            allowFullScreen
                                            referrerPolicy="strict-origin-when-cross-origin"
                                          />
                                        </div>
                                      ) : (
                                        <div className="pub-post-video-error">
                                          Unsupported or invalid video URL. Use YouTube, Vimeo,
                                          Loom, Dailymotion or Wistia.
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}

                                {activeMenu === "posts" && (
                                  <div className="pub-post-gallery-uploader">
                                    <div className="pub-post-gallery-head">
                                      <div>
                                        <div className="pub-resource-media-title">
                                          <ImagePlus size={12} />
                                          Upload Gallery Media
                                        </div>
                                        <div className="pub-resource-media-copy" style={{ marginBottom: 0 }}>
                                          Upload up to 10 JPG, PNG or WEBP images. Upload begins automatically after selection.
                                        </div>
                                      </div>
                                      <span className="pub-post-gallery-count">
                                        {postGalleryMedia.length}/10
                                      </span>
                                    </div>

                                    <label
                                      className={`pub-post-gallery-trigger ${
                                        editingLocked ||
                                        sectionSaving ||
                                        postGalleryUploading ||
                                        postGalleryMedia.length >= 10
                                          ? "disabled"
                                          : ""
                                      }`}
                                    >
                                      <UploadCloud size={13} />
                                      {postGalleryUploading
                                        ? "Uploading gallery…"
                                        : postGalleryMedia.length >= 10
                                          ? "Gallery limit reached"
                                          : "Choose gallery images"}

                                      <input
                                        className="pub-post-gallery-input"
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        multiple
                                        onChange={(e) => {
                                          // FileList is live in Chromium. Copy the File objects before
                                          // clearing the input, otherwise the list becomes empty and the
                                          // gallery upload silently never starts.
                                          const files = Array.from(e.currentTarget.files || []);
                                          e.currentTarget.value = "";
                                          void handlePostGallerySelection(files);
                                        }}
                                        disabled={
                                          editingLocked ||
                                          sectionSaving ||
                                          postGalleryUploading ||
                                          postGalleryMedia.length >= 10
                                        }
                                      />
                                    </label>

                                    {postGalleryUploading && (
                                      <div className="pub-media-progress" aria-live="polite">
                                        <div className="pub-media-progress-track">
                                          <div
                                            className="pub-media-progress-fill"
                                            style={{
                                              width: `${Math.max(
                                                0,
                                                Math.min(100, postGalleryUploadProgress)
                                              )}%`,
                                            }}
                                          />
                                        </div>
                                        <span className="pub-media-progress-value">
                                          {postGalleryUploadProgress}%
                                        </span>
                                      </div>
                                    )}

                                    {postGalleryMedia.length > 0 && (
                                      <div className="pub-post-gallery-preview">
                                        {postGalleryMedia.map((media, index) => (
                                          <div
                                            className="pub-post-gallery-thumb"
                                            key={`${media.url}-${index}`}
                                          >
                                            <img
                                              src={media.url}
                                              alt={`Gallery image ${index + 1}`}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="pub-resource-modal-foot">
                              <button
                                className="pub-secondary-btn"
                                onClick={closeResourceModal}
                                disabled={sectionSaving || resourceMediaUploading || postGalleryUploading}
                              >
                                Cancel
                              </button>

                              <button
                                className="pub-primary-btn"
                                onClick={() => saveResource(activeMenu)}
                                disabled={sectionSaving || editingLocked || resourceMediaUploading || postGalleryUploading}
                              >
                                <Save size={14} />
                                {sectionSaving
                                  ? "Saving…"
                                  : editingResourceId
                                    ? `Update ${RESOURCE_CONFIG[activeMenu].singular}`
                                    : `Add ${RESOURCE_CONFIG[activeMenu].singular}`}
                              </button>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : activeMenu === "submit" ? (
                  <div className="pub-foundation-wrap">
                    <div className="pub-foundation-card">
                      <div className="pub-foundation-head">
                        <div>
                          <div className="pub-foundation-kicker">
                            <ShieldCheck size={11} />
                            Review workflow
                          </div>
                          <h2 className="pub-foundation-title">Preview & Submit</h2>
                          <p className="pub-foundation-copy">
                            Review the foundation of your provider profile before sending it to the administrator. Approval and public publishing remain admin-controlled.
                          </p>
                        </div>
                      </div>

                      {sectionError && <div className="pub-foundation-feedback error">{sectionError}</div>}
                      {sectionSuccess && <div className="pub-foundation-feedback success">{sectionSuccess}</div>}

                      {previewLoading ? (
                        <div className="pub-resource-empty">Preparing profile summary…</div>
                      ) : (
                        <>
                          <div className="pub-preview-grid">
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{aboutForm.overview.trim() ? "✓" : "—"}</div>
                              <div className="pub-preview-stat-label">About</div>
                            </div>
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{resourceItems.posts.length}</div>
                              <div className="pub-preview-stat-label">Posts</div>
                            </div>
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{resourceItems.whitepapers.length}</div>
                              <div className="pub-preview-stat-label">Whitepapers</div>
                            </div>
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{resourceItems.products.length}</div>
                              <div className="pub-preview-stat-label">Products</div>
                            </div>
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{resourceItems.contacts.length}</div>
                              <div className="pub-preview-stat-label">Contacts</div>
                            </div>
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{resourceItems.calendar.length}</div>
                              <div className="pub-preview-stat-label">Appointments</div>
                            </div>
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{resourceItems.webinars.length}</div>
                              <div className="pub-preview-stat-label">Webinars</div>
                            </div>
                            <div className="pub-preview-stat">
                              <div className="pub-preview-stat-value">{resourceItems.events.length}</div>
                              <div className="pub-preview-stat-label">Events</div>
                            </div>
                          </div>

                          <div className="pub-review-panel">
                            <div className="pub-company-editor-side-label">Current moderation state</div>
                            <div className="pub-review-state">
                              {companies[0].moderationState.replaceAll("_", " ")}
                            </div>
                            <div className="pub-review-copy">
                              {moderationState === "changes_requested"
                                ? "Make the requested revisions across your profile, then send the updated version back to the administrator."
                                : moderationState === "rejected"
                                  ? "You can correct the rejected profile and submit it again for a fresh administrative review."
                                  : moderationState === "approved"
                                    ? "The approved version is live. If you make new edits, they become a draft revision while the last approved snapshot remains unchanged."
                                    : moderationState === "pending_review"
                                      ? "Your current submission is with the administrator. Editing is locked until a decision is made."
                                      : "Submission sends this company profile into the admin review queue. It does not publish anything automatically."}
                            </div>

                            <button
                              className="pub-primary-btn"
                              onClick={submitCompanyForReview}
                              disabled={
                                submitLoading ||
                                moderationState === "pending_review" ||
                                moderationState === "approved"
                              }
                            >
                              <Send size={14} />
                              {submitLoading
                                ? "Submitting…"
                                : moderationState === "pending_review"
                                  ? "Pending Admin Review"
                                  : moderationState === "changes_requested"
                                    ? "Resubmit Revised Profile"
                                    : moderationState === "rejected"
                                      ? "Submit Corrected Profile"
                                      : moderationState === "approved"
                                        ? "No New Revision to Submit"
                                        : "Submit for Review"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pub-placeholder">
                    <div className="pub-placeholder-card">
                      <div className="pub-placeholder-icon">
                        <Building2 size={20} />
                      </div>
                      <h2 className="pub-placeholder-title">{PAGE_TITLES[activeMenu]}</h2>
                      <p className="pub-placeholder-copy">This section is ready for its next implementation stage.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </main>
      </div>

      <AnimatePresence>
        {whitepaperResponsesOpen && (
          <motion.div
            className="pub-resource-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeWhitepaperResponses();
            }}
          >
            <motion.div
              className="pub-responses-modal"
              initial={{ opacity: 0, y: 18, scale: .985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: .99 }}
              transition={{ duration: .22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="pub-resource-modal-head">
                <div>
                  <div className="pub-foundation-kicker">
                    <Users size={11} />
                    Whitepaper leads
                  </div>
                  <h2 className="pub-resource-modal-title">Responses</h2>
                  <p className="pub-resource-modal-copy">{whitepaperResponsesTitle}</p>
                </div>

                <button
                  type="button"
                  className="pub-resource-modal-close"
                  onClick={closeWhitepaperResponses}
                  disabled={whitepaperResponsesLoading}
                  aria-label="Close responses"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="pub-responses-body">
                {whitepaperResponsesError ? (
                  <div className="pub-foundation-feedback error">
                    {whitepaperResponsesError}
                  </div>
                ) : whitepaperResponsesLoading ? (
                  <div className="pub-responses-empty">Loading responses…</div>
                ) : whitepaperResponses.length === 0 ? (
                  <div className="pub-responses-empty">
                    No responses have been submitted for this whitepaper yet.
                  </div>
                ) : (
                  <>
                    <div className="pub-responses-count">
                      <Users size={10} />
                      {whitepaperResponses.length} response
                      {whitepaperResponses.length === 1 ? "" : "s"}
                    </div>

                    <div className="pub-responses-table-wrap">
                      <table className="pub-responses-table">
                        <thead>
                          <tr>
                            <th>First Name</th>
                            <th>Last Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Company</th>
                            <th>Address</th>
                            <th>Submitted</th>
                            <th>Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {whitepaperResponses.map((response) => {
                            const expanded =
                              expandedWhitepaperResponseId === response.id;

                            return (
                              <Fragment key={response.id}>
                                <tr>
                                  <td>{response.firstName || "—"}</td>
                                  <td>{response.lastName || "—"}</td>
                                  <td>{response.email || "—"}</td>
                                  <td>{response.phone || "—"}</td>
                                  <td>{response.company || "—"}</td>
                                  <td>{response.address || "—"}</td>
                                  <td>{formatResourceDate(response.submittedAt)}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className={`pub-response-message-btn ${
                                        expanded ? "open" : ""
                                      }`}
                                      onClick={() =>
                                        setExpandedWhitepaperResponseId(
                                          expanded ? null : response.id
                                        )
                                      }
                                      title={expanded ? "Hide message" : "Show message"}
                                    >
                                      <ChevronDown size={13} />
                                    </button>
                                  </td>
                                </tr>

                                {expanded && (
                                  <tr className="pub-response-expanded">
                                    <td colSpan={8}>
                                      <div className="pub-response-message-panel">
                                        <div className="pub-response-message-label">
                                          <MessageSquareText size={11} />
                                          Message
                                        </div>
                                        <div className="pub-response-message-copy">
                                          {response.message?.trim() ||
                                            "No message was provided with this response."}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {webinarResponsesOpen && (
          <motion.div
            className="pub-resource-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeWebinarResponses();
            }}
          >
            <motion.div
              className="pub-responses-modal"
              initial={{ opacity: 0, y: 18, scale: .985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: .99 }}
              transition={{ duration: .22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="pub-resource-modal-head">
                <div>
                  <div className="pub-foundation-kicker">
                    <Users size={11} />
                    Webinar leads
                  </div>
                  <h2 className="pub-resource-modal-title">Responses</h2>
                  <p className="pub-resource-modal-copy">{webinarResponsesTitle}</p>
                </div>

                <button
                  type="button"
                  className="pub-resource-modal-close"
                  onClick={closeWebinarResponses}
                  disabled={webinarResponsesLoading}
                  aria-label="Close responses"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="pub-responses-body">
                {webinarResponsesError ? (
                  <div className="pub-foundation-feedback error">
                    {webinarResponsesError}
                  </div>
                ) : webinarResponsesLoading ? (
                  <div className="pub-responses-empty">Loading responses…</div>
                ) : webinarResponses.length === 0 ? (
                  <div className="pub-responses-empty">
                    No responses have been submitted for this webinar yet.
                  </div>
                ) : (
                  <>
                    <div className="pub-responses-count">
                      <Users size={10} />
                      {webinarResponses.length} response
                      {webinarResponses.length === 1 ? "" : "s"}
                    </div>

                    <div className="pub-responses-table-wrap">
                      <table className="pub-responses-table">
                        <thead>
                          <tr>
                            <th>First Name</th>
                            <th>Last Name</th>
                            <th>Email</th>
                            <th>Country</th>
                            <th>Company</th>
                            <th>Submitted</th>
                            <th>Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {webinarResponses.map((response) => {
                            const expanded =
                              expandedWebinarResponseId === response.id;

                            return (
                              <Fragment key={response.id}>
                                <tr>
                                  <td>{response.firstName || "—"}</td>
                                  <td>{response.lastName || "—"}</td>
                                  <td>{response.email || "—"}</td>
                                  <td>{response.country || "—"}</td>
                                  <td>{response.company || "—"}</td>
                                  <td>{formatResourceDate(response.submittedAt)}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className={`pub-response-message-btn ${
                                        expanded ? "open" : ""
                                      }`}
                                      onClick={() =>
                                        setExpandedWebinarResponseId(
                                          expanded ? null : response.id
                                        )
                                      }
                                      title={expanded ? "Hide message" : "Show message"}
                                    >
                                      <ChevronDown size={13} />
                                    </button>
                                  </td>
                                </tr>

                                {expanded && (
                                  <tr className="pub-response-expanded">
                                    <td colSpan={7}>
                                      <div className="pub-response-message-panel">
                                        <div className="pub-response-message-label">
                                          <MessageSquareText size={11} />
                                          Message
                                        </div>
                                        <div className="pub-response-message-copy">
                                          {response.message?.trim() ||
                                            "No message was provided with this response."}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogoutModal && (
          <motion.div
            className="pub-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="pub-modal"
              initial={{ opacity: 0, scale: .97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: .985, y: 8 }}
              transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="pub-modal-icon">
                <LogOut size={20} />
              </div>

              <h3 className="pub-modal-title">Sign out?</h3>
              <p className="pub-modal-copy">
                You will be signed out of the Publisher Workspace.
              </p>

              <div className="pub-modal-actions">
                <button
                  className="pub-secondary-btn"
                  onClick={() => setShowLogoutModal(false)}
                >
                  Cancel
                </button>
                <button className="pub-primary-btn" onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
