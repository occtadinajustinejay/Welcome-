
/* =========================================================
   WELCOME! — A WORLD OF YOUR OWN
   APP.JS — VERSION 1.0
   Black + Emerald Glassmorphism
   ========================================================= */

"use strict";

/* =========================================================
   01. DATABASE
   ========================================================= */

const DB_NAME = "WelcomePersonalSpace";
const DB_VERSION = 1;
const STORE_NAME = "records";

let db;
let currentUser = null;
let currentPage = "homePage";
let selectedPostImage = null;
let selectedPostVideo = null;
let activeMediaId = null;
let activeMediaType = null;

const objectURLs = new Map();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function saveRecord(record) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
}

function getRecord(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function getAllRecords() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function deleteRecord(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function ownedRecords(type) {
  return getAllRecords().then(records =>
    records.filter(record =>
      record.type === type &&
      record.owner === currentUser
    )
  );
}

/* =========================================================
   02. UTILITIES
   ========================================================= */

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function mediaURL(id, blob) {
  if (objectURLs.has(id)) return objectURLs.get(id);

  const url = URL.createObjectURL(blob);
  objectURLs.set(id, url);
  return url;
}

function showToast(message) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");

  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function setMessage(id, message) {
  const element = document.getElementById(id);
  if (element) element.textContent = message;
}

async function hashPassword(password) {
  if (!crypto.subtle) {
    throw new Error("Please open Welcome! through HTTPS or localhost to use secure account passwords.");
  }

  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/* =========================================================
   03. ACCOUNT SYSTEM
   ========================================================= */

let authMode = "login";

function getSavedAccounts() {
  try {
    return JSON.parse(localStorage.getItem("WELCOME_ACCOUNTS") || "[]");
  } catch {
    return [];
  }
}

function updateSavedAccounts(email, remember) {
  let accounts = getSavedAccounts();

  if (remember) {
    if (!accounts.includes(email)) accounts.push(email);
  } else {
    accounts = accounts.filter(item => item !== email);
  }

  localStorage.setItem("WELCOME_ACCOUNTS", JSON.stringify(accounts));
  renderSavedAccounts();
}

function renderSavedAccounts() {
  const panel = document.getElementById("savedAccountsPanel");
  const list = document.getElementById("savedAccountsList");
  const accounts = getSavedAccounts();

  list.replaceChildren();
  panel.hidden = accounts.length === 0;

  accounts.forEach(email => {
    const button = document.createElement("button");
    button.className = "secondary-button";
    button.textContent = email;
    button.style.margin = "5px";
    button.addEventListener("click", () => {
      document.getElementById("authEmail").value = email;
      document.getElementById("authPassword").focus();
    });

    list.appendChild(button);
  });
}

function setAuthMode(mode) {
  authMode = mode;

  const login = mode === "login";

  document.getElementById("loginTab").classList.toggle("active", login);
  document.getElementById("signupTab").classList.toggle("active", !login);

  document.getElementById("authName").hidden = login;
  document.getElementById("authNameLabel").hidden = login;
  document.getElementById("authName").required = !login;

  document.getElementById("authSubmit").textContent =
    login ? "Enter your world" : "Create your world";

  setMessage("authMessage", "");
}

async function handleAuthentication(event) {
  event.preventDefault();

  const email = document.getElementById("authEmail").value
    .trim().toLowerCase();

  const password = document.getElementById("authPassword").value;
  const remember = document.getElementById("rememberUser").checked;

  if (!email || !password) return;

  try {
    const accountId = "account-" + email;
    let account = await getRecord(accountId);

    if (authMode === "signup") {
      const name = document.getElementById("authName").value.trim();

      if (!name) {
        setMessage("authMessage", "Please enter your name.");
        return;
      }

      if (password.length < 8) {
        setMessage("authMessage", "Use at least 8 characters for your password.");
        return;
      }

      if (account) {
        setMessage("authMessage", "An account with this email already exists.");
        return;
      }

      account = {
        id: accountId,
        type: "account",
        email,
        passwordHash: await hashPassword(password),
        createdAt: Date.now()
      };

      await saveRecord(account);

      await saveRecord({
        id: "profile-" + email,
        type: "profile",
        owner: email,
        name,
        bio: "Your space, your story.",
        picture: null,
        followingDisplay: 12
      });

    } else {
      if (!account) {
        setMessage("authMessage", "Account not found. Please create an account first.");
        return;
      }

      const hash = await hashPassword(password);

      if (hash !== account.passwordHash) {
        setMessage("authMessage", "Incorrect email or password.");
        return;
      }
    }

    updateSavedAccounts(email, remember);

    if (remember) {
      localStorage.setItem("WELCOME_SESSION", email);
    } else {
      localStorage.removeItem("WELCOME_SESSION");
    }

    await enterApp(email);

  } catch (error) {
    console.error(error);
    setMessage("authMessage", error.message || "Something went wrong.");
  }
}

async function enterApp(email) {
  currentUser = email;

  document.getElementById("authScreen").hidden = true;
  document.getElementById("appShell").hidden = false;

  const profile = await getRecord("profile-" + email);
  document.getElementById("topbarAvatar").textContent =
    (profile?.name || "W").charAt(0).toUpperCase();

  await refreshApp();
  navigateTo("homePage");
}

async function restoreSession() {
  const email = localStorage.getItem("WELCOME_SESSION");
  if (!email) return;

  const account = await getRecord("account-" + email);

  if (account) {
    await enterApp(email);
  } else {
    localStorage.removeItem("WELCOME_SESSION");
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem("WELCOME_SESSION");

  document.getElementById("appShell").hidden = true;
  document.getElementById("authScreen").hidden = false;
  document.getElementById("authPassword").value = "";

  renderSavedAccounts();
  showToast("You have logged out.");
}

/* =========================================================
   04. NAVIGATION
   ========================================================= */

function navigateTo(pageId) {
  const page = document.getElementById(pageId);
  if (!page) return;

  document.querySelectorAll(".page").forEach(item => {
    item.classList.remove("active");
  });

  page.classList.add("active");
  currentPage = pageId;

  document.querySelectorAll(".nav-button").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageId
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   05. PROFILE
   ========================================================= */

async function renderProfile() {
  const profile = await getRecord("profile-" + currentUser);
  if (!profile) return;

  document.getElementById("profileName").textContent = profile.name;
  document.getElementById("profileBio").textContent = profile.bio || "";

  document.getElementById("topbarAvatar").textContent =
    profile.name.charAt(0).toUpperCase();

  document.getElementById("followingCount").textContent =
    profile.followingDisplay ?? 12;

  const picture = document.getElementById("profilePicture");

  if (profile.picture) {
    picture.src = mediaURL("profile-" + currentUser, profile.picture);
  } else {
    picture.removeAttribute("src");
  }

  const posts = await ownedRecords("post");
  document.getElementById("postCount").textContent = posts.length;
}

async function saveProfile() {
  const profile = await getRecord("profile-" + currentUser);
  if (!profile) return;

  const name = document.getElementById("editName").value.trim();
  const bio = document.getElementById("editBio").value.trim();

  if (!name) {
    showToast("Your name cannot be empty.");
    return;
  }

  profile.name = name;
  profile.bio = bio;

  await saveRecord(profile);

  document.getElementById("profileEditor").hidden = true;

  await renderProfile();
  showToast("Profile updated.");
}

async function uploadProfilePicture(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const profile = await getRecord("profile-" + currentUser);
  profile.picture = file;

  await saveRecord(profile);
  await renderProfile();

  showToast("Profile picture updated.");
}

/* =========================================================
   06. CREATE POSTS
   ========================================================= */

function previewPostMedia(file, type) {
  if (!file) return;

  const preview = document.getElementById("postImagePreview");
  const url = URL.createObjectURL(file);

  const element = document.createElement(type === "video" ? "video" : "img");

  element.src = url;

  if (type === "video") {
    element.controls = true;
  }

  preview.replaceChildren(element);
}

async function publishPost() {
  const text = document.getElementById("postText").value.trim();

  // Text, image, or video is enough to publish.
  if (!text && !selectedPostImage && !selectedPostVideo) {
    setMessage("postMessage", "Write something or add a photo/video first.");
    return;
  }

  const profile = await getRecord("profile-" + currentUser);

  const post = {
    id: "post-" + makeId(),
    type: "post",
    owner: currentUser,
    author: profile.name,
    text,
    image: selectedPostImage,
    video: selectedPostVideo,
    likes: 0,
    liked: false,
    comments: [],
    createdAt: Date.now()
  };

  try {
    await saveRecord(post);

    document.getElementById("postText").value = "";
    document.getElementById("postImagePreview").replaceChildren();
    document.getElementById("postImageInput").value = "";
    document.getElementById("postVideoInput").value = "";

    selectedPostImage = null;
    selectedPostVideo = null;

    setMessage("postMessage", "Published successfully!");
    await refreshApp();

  } catch (error) {
    console.error(error);
    setMessage("postMessage", "Could not publish. Please try again.");
  }
}

/* =========================================================
   07. RENDER POSTS
   ========================================================= */

async function renderFeed(containerId, ownOnly = false) {
  const container = document.getElementById(containerId);
  const posts = await ownedRecords("post");

  const visiblePosts = ownOnly
    ? posts
    : posts;

  visiblePosts.sort((a, b) => b.createdAt - a.createdAt);
  container.replaceChildren();

  for (const post of visiblePosts) {
    const card = document.createElement("article");
    card.className = "post-card";

    const header = document.createElement("div");
    header.className = "post-header";

    const author = document.createElement("div");
    author.innerHTML =
      `<div class="post-author">${escapeText(post.author)}</div>
       <div class="post-date">${formatDate(post.createdAt)}</div>`;

    const deleteButton = document.createElement("button");
    deleteButton.className = "secondary-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deletePost(post.id));

    header.append(author, deleteButton);
    card.appendChild(header);

    if (post.text) {
      const content = document.createElement("p");
      content.className = "post-content";
      content.textContent = post.text;
      card.appendChild(content);
    }

    if (post.image) {
      const image = document.createElement("img");
      image.className = "post-media";
      image.src = mediaURL(post.id + "-image", post.image);
      image.alt = "Post image";
      card.appendChild(image);
    }

    if (post.video) {
      const video = document.createElement("video");
      video.className = "post-media";
      video.src = mediaURL(post.id + "-video", post.video);
      video.controls = true;
      card.appendChild(video);
    }

    const actions = document.createElement("div");
    actions.className = "post-actions";

    const like = document.createElement("button");
    like.textContent = `${post.liked ? "♥" : "♡"} ${post.likes || 0} Likes`;
    like.addEventListener("click", () => toggleLike(post.id));

    const comment = document.createElement("button");
    comment.textContent = `Comments (${post.comments?.length || 0})`;
    comment.addEventListener("click", () => addComment(post.id));

    actions.append(like, comment);
    card.appendChild(actions);

    container.appendChild(card);
  }
}

async function deletePost(id) {
  if (!confirm("Delete this post?")) return;

  await deleteRecord(id);
  await refreshApp();
  showToast("Post deleted.");
}

async function toggleLike(id) {
  const post = await getRecord(id);
  if (!post) return;

  post.liked = !post.liked;
  post.likes = Math.max(0, (post.likes || 0) + (post.liked ? 1 : -1));

  await saveRecord(post);
  await refreshApp();
}

async function addComment(id) {
  const post = await getRecord(id);
  if (!post) return;

  const commentText = prompt("Write your comment:");
  if (!commentText || !commentText.trim()) return;

  const profile = await getRecord("profile-" + currentUser);

  post.comments = post.comments || [];
  post.comments.push({
    id: makeId(),
    author: profile.name,
    text: commentText.trim(),
    createdAt: Date.now()
  });

  await saveRecord(post);
  await refreshApp();
  showToast("Comment added.");
}

/* =========================================================
   08. UNIVERSAL MODAL
   ========================================================= */

function openModal(content) {
  const modal = document.getElementById("appModal");
  const area = document.getElementById("modalContent");

  area.replaceChildren();

  if (typeof content === "string") {
    area.innerHTML = content;
  } else {
    area.appendChild(content);
  }

  modal.hidden = false;
}

function closeModal() {
  document.getElementById("appModal").hidden = true;
}

/* =========================================================
   09. ANIME AND MANGA COLLECTIONS
   ========================================================= */

async function addCollectionItem(type) {
  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <h3>Add ${type}</h3>
    <label for="collectionTitle">Title</label>
    <input id="collectionTitle" type="text" placeholder="Enter title">
    <label for="collectionDescription">Description</label>
    <textarea id="collectionDescription" placeholder="Optional description"></textarea>
    <label for="collectionCover">Cover image</label>
    <input id="collectionCover" type="file" accept="image/*">
    <button id="saveCollection" class="primary-button">Save</button>
  `;

  openModal(wrapper);

  wrapper.querySelector("#saveCollection").addEventListener("click", async () => {
    const title = wrapper.querySelector("#collectionTitle").value.trim();
    const description = wrapper.querySelector("#collectionDescription").value.trim();
    const cover = wrapper.querySelector("#collectionCover").files[0] || null;

    if (!title) {
      showToast("Please enter a title.");
      return;
    }

    await saveRecord({
      id: type + "-" + makeId(),
      type,
      owner: currentUser,
      title,
      description,
      cover,
      createdAt: Date.now()
    });

    closeModal();
    await refreshApp();
    showToast("Added to your collection.");
  });
}

async function editCollectionItem(id) {
  const item = await getRecord(id);
  if (!item || item.owner !== currentUser) return;

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <h3>Edit collection item</h3>
    <label for="editCollectionTitle">Title</label>
    <input id="editCollectionTitle" type="text">
    <label for="editCollectionDescription">Description</label>
    <textarea id="editCollectionDescription"></textarea>
    <label for="editCollectionCover">Replace cover (optional)</label>
    <input id="editCollectionCover" type="file" accept="image/*">
    <button id="updateCollection" class="primary-button">Update</button>
  `;

  wrapper.querySelector("#editCollectionTitle").value = item.title;
  wrapper.querySelector("#editCollectionDescription").value = item.description || "";

  openModal(wrapper);

  wrapper.querySelector("#updateCollection").addEventListener("click", async () => {
    item.title = wrapper.querySelector("#editCollectionTitle").value.trim();
    item.description = wrapper.querySelector("#editCollectionDescription").value.trim();

    const newCover = wrapper.querySelector("#editCollectionCover").files[0];
    if (newCover) item.cover = newCover;

    if (!item.title) {
      showToast("Title cannot be empty.");
      return;
    }

    await saveRecord(item);
    closeModal();
    await refreshApp();
    showToast("Changes saved.");
  });
}

async function renderCollection(type, containerId) {
  const container = document.getElementById(containerId);
  const items = await ownedRecords(type);

  container.replaceChildren();

  items.sort((a, b) => b.createdAt - a.createdAt);

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "collection-card";

    if (item.cover) {
      const image = document.createElement("img");
      image.src = mediaURL(item.id + "-cover", item.cover);
      image.alt = item.title + " cover";
      card.appendChild(image);
    }

    const content = document.createElement("div");
    content.className = "collection-card-content";

    const title = document.createElement("h4");
    title.textContent = item.title;

    const description = document.createElement("p");
    description.textContent = item.description || "";

    const edit = document.createElement("button");
    edit.className = "secondary-button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editCollectionItem(item.id));

    const remove = document.createElement("button");
    remove.className = "secondary-button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (confirm("Delete this collection item?")) {
        await deleteRecord(item.id);
        await refreshApp();
      }
    });

    content.append(title, description, edit, remove);
    card.appendChild(content);
    container.appendChild(card);
  });
}

/* =========================================================
   10. GAMING GALLERY
   ========================================================= */

async function addGamingMedia(files) {
  for (const file of files) {
    if (!file.type.startsWith("image/") &&
        !file.type.startsWith("video/")) continue;

    await saveRecord({
      id: "gaming-" + makeId(),
      type: "gaming",
      owner: currentUser,
      media: file,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
      createdAt: Date.now()
    });
  }

  await renderGamingGallery();
  showToast("Gallery updated.");
}

async function renderGamingGallery() {
  const container = document.getElementById("gamingGallery");
  const items = await ownedRecords("gaming");

  container.replaceChildren();

  items.sort((a, b) => b.createdAt - a.createdAt);

  items.forEach(item => {
    const wrapper = document.createElement("div");
    wrapper.className = "media-item";

    const element = document.createElement(
      item.mediaType === "video" ? "video" : "img"
    );

    element.src = mediaURL(item.id, item.media);

    if (item.mediaType === "video") {
      element.muted = true;
    }

    wrapper.appendChild(element);
    wrapper.addEventListener("click", () => openLightbox(item));
    container.appendChild(wrapper);
  });
}

function openLightbox(item) {
  activeMediaId = item.id;
  activeMediaType = item.type;

  const content = document.getElementById("gamingLightboxContent");
  content.replaceChildren();

  const element = document.createElement(
    item.mediaType === "video" ? "video" : "img"
  );

  element.src = mediaURL(item.id, item.media);

  if (item.mediaType === "video") {
    element.controls = true;
    element.autoplay = true;
  }

  content.appendChild(element);
  document.getElementById("gamingLightbox").hidden = false;
}

async function deleteActiveMedia() {
  if (!activeMediaId) return;
  if (!confirm("Delete this media?")) return;

  await deleteRecord(activeMediaId);

  document.getElementById("gamingLightbox").hidden = true;
  activeMediaId = null;

  if (activeMediaType === "story") {
    await renderStories();
  } else {
    await renderGamingGallery();
  }

  showToast("Media deleted.");
}

/* =========================================================
   11. MUSIC
   ========================================================= */

async function addMusic(files) {
  for (const file of files) {
    if (!file.type.startsWith("audio/")) continue;

    await saveRecord({
      id: "music-" + makeId(),
      type: "music",
      owner: currentUser,
      title: file.name,
      audio: file,
      createdAt: Date.now()
    });
  }

  await renderMusic();
  showToast("Music added.");
}

async function renderMusic() {
  const container = document.getElementById("musicContainer");
  const items = await ownedRecords("music");

  container.replaceChildren();

  items.sort((a, b) => b.createdAt - a.createdAt);

  items.forEach(item => {
    const wrapper = document.createElement("div");
    wrapper.className = "music-item";

    const details = document.createElement("div");
    details.textContent = item.title;
    details.style.flex = "1";

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = mediaURL(item.id, item.audio);

    const remove = document.createElement("button");
    remove.className = "secondary-button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (confirm("Delete this audio?")) {
        await deleteRecord(item.id);
        await renderMusic();
      }
    });

    wrapper.append(details, audio, remove);
    container.appendChild(wrapper);
  });
}

/* =========================================================
   12. STORIES AND HIGHLIGHTS
   ========================================================= */

async function addStory(file) {
  if (!file || (!file.type.startsWith("image/") &&
      !file.type.startsWith("video/"))) return;

  await saveRecord({
    id: "story-" + makeId(),
    type: "story",
    owner: currentUser,
    media: file,
    mediaType: file.type.startsWith("video/") ? "video" : "image",
    createdAt: Date.now()
  });

  await renderStories();
  showToast("Story added.");
}

async function renderStories() {
  const container = document.getElementById("storiesContainer");
  const stories = await ownedRecords("story");

  container.replaceChildren();

  stories.sort((a, b) => b.createdAt - a.createdAt);

  stories.forEach(story => {
    const wrapper = document.createElement("div");
    wrapper.className = "media-item";

    const element = document.createElement(
      story.mediaType === "video" ? "video" : "img"
    );

    element.src = mediaURL(story.id, story.media);

    if (story.mediaType === "video") element.muted = true;

    wrapper.appendChild(element);
    wrapper.addEventListener("click", () => openLightbox(story));

    container.appendChild(wrapper);
  });

  await renderHighlights();
}

async function createHighlight() {
  const stories = await ownedRecords("story");

  if (!stories.length) {
    showToast("Add a story before creating a highlight.");
    return;
  }

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <h3>New highlight</h3>
    <label for="highlightName">Highlight name</label>
    <input id="highlightName" type="text" placeholder="Name your highlight">
    <label for="highlightStory">Choose a story</label>
    <select id="highlightStory"></select>
    <button id="saveHighlight" class="primary-button">Create highlight</button>
  `;

  const select = wrapper.querySelector("#highlightStory");

  stories.forEach(story => {
    const option = document.createElement("option");
    option.value = story.id;
    option.textContent = formatDate(story.createdAt);
    select.appendChild(option);
  });

  openModal(wrapper);

  wrapper.querySelector("#saveHighlight").addEventListener("click", async () => {
    const name = wrapper.querySelector("#highlightName").value.trim();

    if (!name) {
      showToast("Please enter a highlight name.");
      return;
    }

    await saveRecord({
      id: "highlight-" + makeId(),
      type: "highlight",
      owner: currentUser,
      name,
      storyIds: [select.value],
      createdAt: Date.now()
    });

    closeModal();
    await renderHighlights();
    showToast("Highlight created.");
  });
}

async function renderHighlights() {
  const container = document.getElementById("highlightsContainer");
  const highlights = await ownedRecords("highlight");

  container.replaceChildren();

  highlights.forEach(highlight => {
    const button = document.createElement("button");
    button.className = "highlight-item upload-button";
    button.textContent = highlight.name;

    button.addEventListener("click", async () => {
      const story = await getRecord(highlight.storyIds[0]);

      if (story) openLightbox(story);
      else showToast("The story is no longer available.");
    });

    container.appendChild(button);
  });
}

/* =========================================================
   13. SEARCH AND ACCOUNT MENU
   ========================================================= */

function searchPosts() {
  const query = prompt("Search your posts:");
  if (!query) return;

  const cards = document.querySelectorAll("#feedContainer .post-card");
  const normalized = query.toLowerCase();

  cards.forEach(card => {
    card.hidden = !card.textContent.toLowerCase().includes(normalized);
  });

  navigateTo("homePage");
}

function showAccountMenu() {
  const action = prompt(
    "Account options:\n1. Switch account\n2. Log out\n\nEnter 1 or 2:"
  );

  if (action === "1") {
    logout();
    showToast("Enter another saved account to switch.");
  } else if (action === "2") {
    logout();
  }
}

/* =========================================================
   14. REFRESH APP
   ========================================================= */

async function refreshApp() {
  if (!currentUser) return;

  await renderProfile();

  await renderFeed("feedContainer");
  await renderFeed("profileFeedContainer", true);

  await renderCollection("anime", "animeContainer");
  await renderCollection("manga", "mangaContainer");

  await renderGamingGallery();
  await renderMusic();
  await renderStories();
}

/* =========================================================
   15. EVENT LISTENERS
   ========================================================= */

function connectEvents() {
  document.getElementById("loginTab")
    .addEventListener("click", () => setAuthMode("login"));

  document.getElementById("signupTab")
    .addEventListener("click", () => setAuthMode("signup"));

  document.getElementById("authForm")
    .addEventListener("submit", handleAuthentication);

  document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    if (button.classList.contains("nav-button")) return;

    button.addEventListener("click", event => {
      event.preventDefault();
      navigateTo(button.dataset.page);
    });
  });

  document.getElementById("publishPost")
    .addEventListener("click", publishPost);

  document.getElementById("postImageInput")
    .addEventListener("change", event => {
      selectedPostImage = event.target.files[0] || null;
      selectedPostVideo = null;

      if (selectedPostImage) {
        previewPostMedia(selectedPostImage, "image");
      }
    });

  document.getElementById("postVideoInput")
    .addEventListener("change", event => {
      selectedPostVideo = event.target.files[0] || null;
      selectedPostImage = null;

      if (selectedPostVideo) {
        previewPostMedia(selectedPostVideo, "video");
      }
    });

  document.getElementById("editProfileButton")
    .addEventListener("click", async () => {
      const profile = await getRecord("profile-" + currentUser);

      document.getElementById("editName").value = profile.name;
      document.getElementById("editBio").value = profile.bio || "";
      document.getElementById("profileEditor").hidden = false;
    });

  document.getElementById("saveProfileButton")
    .addEventListener("click", saveProfile);

  document.getElementById("profilePictureInput")
    .addEventListener("change", event => {
      uploadProfilePicture(event.target.files[0]);
    });

  document.getElementById("gamingUpload")
    .addEventListener("change", event => {
      addGamingMedia(Array.from(event.target.files));
      event.target.value = "";
    });

  document.getElementById("addAnimeButton")
    .addEventListener("click", () => addCollectionItem("anime"));

  document.getElementById("addMangaButton")
    .addEventListener("click", () => addCollectionItem("manga"));

  document.getElementById("musicUpload")
    .addEventListener("change", event => {
      addMusic(Array.from(event.target.files));
      event.target.value = "";
    });

  document.getElementById("storyUpload")
    .addEventListener("change", event => {
      addStory(event.target.files[0]);
      event.target.value = "";
    });

  document.getElementById("addHighlightButton")
    .addEventListener("click", createHighlight);

  document.getElementById("closeModal")
    .addEventListener("click", closeModal);

  document.getElementById("appModal")
    .addEventListener("click", event => {
      if (event.target.id === "appModal") closeModal();
    });

  document.getElementById("deleteGamingMedia")
    .addEventListener("click", deleteActiveMedia);

  document.getElementById("closeGamingLightbox")
    .addEventListener("click", () => {
      document.getElementById("gamingLightbox").hidden = true;
    });

  document.getElementById("searchButton")
    .addEventListener("click", searchPosts);

  document.getElementById("notificationButton")
    .addEventListener("click", () => showToast("You're all caught up!"));

  document.getElementById("accountMenuButton")
    .addEventListener("click", showAccountMenu);
}

/* =========================================================
   16. INITIALIZATION
   ========================================================= */

async function initializeWelcome() {
  try {
    await openDatabase();

    connectEvents();
    renderSavedAccounts();

    await restoreSession();

    console.log("Welcome! is ready.");
  } catch (error) {
    console.error("Welcome! initialization failed:", error);
    alert("Welcome! could not start. Please check the browser console.");
  }
}

document.addEventListener("DOMContentLoaded", initializeWelcome);

/* =========================================================
   END OF WELCOME! APP.JS
   ========================================================= */
