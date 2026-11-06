import { Fragment, useEffect, useRef, useState } from "react";
import { adminApi as api } from "../services/adminApi";
import { AdminDialog, AdminPageFrame } from "./ManagementPageComponents";
import ProductImage from "../../Customer/react/ProductImage";
import { LOW_STOCK_THRESHOLD, PRODUCT_CATEGORIES } from "../../../../shared/inventory.json";
import SERVICE_CATEGORIES from "../../../../shared/serviceCategories.json";

const stockClass = (available) => available <= 0
  ? "stock-text out"
  : available <= LOW_STOCK_THRESHOLD
    ? "stock-text low"
    : "stock-text";

const createEmptyVariant = () => ({
  brand: "",
  model: "",
  size: "",
  color: "",
  price: "",
  stock: "",
  imageUrl: "",
  imagePublicId: "",
  imageFile: null,
  imagePreview: "",
  removeImage: false,
  imageError: "",
});

const validateItemForm = (form, variants) => {
  const errors = {};
  const name = form.name.trim();
  const price = Number(form.price);
  const stock = Number(form.quantity);

  if (name.length < 2 || name.length > 80) errors.name = "Name must be 2 to 80 characters.";
  if (!variants.length) {
    if (form.price === "" || !Number.isFinite(price) || price < 0.01 || price > 999999.99) {
      errors.price = "Price must be from 0.01 to 999,999.99.";
    }
    if (form.quantity === "" || !Number.isInteger(stock) || stock < 0 || stock > 99999) {
      errors.quantity = "Stock must be a whole number from 0 to 99,999.";
    }
  }
  if (!PRODUCT_CATEGORIES.includes(form.category)) {
    errors.category = "Choose a listed category before saving.";
  }
  return errors;
};

const validateVariantRows = (variants) => variants.map((variant) => {
  const errors = {};
  if (![variant.brand, variant.model, variant.size, variant.color].some((value) => value.trim())) {
    errors.attributes = "Fill in at least one attribute.";
  }
  const price = Number(variant.price);
  if (variant.price === "" || !Number.isFinite(price) || price < 0.01) {
    errors.price = "Price must be at least 0.01.";
  }
  const stock = Number(variant.stock);
  if (variant.stock === "" || !Number.isInteger(stock) || stock < 0) {
    errors.stock = "Stock must be a whole number of 0 or more.";
  }
  return errors;
});

const variantLabel = (variant) => {
  const fitment = [variant.brand, variant.model].filter(Boolean).join(" ");
  const sizeAndColor = variant.color && variant.size
    ? `${variant.color} / ${variant.size}`
    : variant.color || variant.size;
  return fitment && sizeAndColor ? `${fitment} - ${sizeAndColor}` : fitment || sizeAndColor || "Variant";
};

const formatPrice = (price) => `₱${Number(price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const validateServiceForm = (form) => {
  const errors = {};
  const name = form.name.trim();
  const category = form.category.trim();
  const price = Number(form.price);
  const mechanicFee = Number(form.mechanicFee);
  const laborOnlyPrice = Number(form.laborOnlyPrice);
  const laborPriceMin = Number(form.laborPriceMin);
  const laborPriceMax = Number(form.laborPriceMax);
  const durationMinutes = Number(form.durationMinutes);
  const maxUnits = Number(form.maxUnits);

  if (name.length < 2 || name.length > 80) errors.name = "Name must be 2 to 80 characters.";
  if (!SERVICE_CATEGORIES.includes(category)) errors.category = "Choose a valid service category.";
  if (form.description.length > 300) errors.description = "Description must be 300 characters or fewer.";
  if (form.price === "" || !Number.isFinite(price) || price < 0.01 || price > 999999.99) {
    errors.price = "Price must be from 0.01 to 999,999.99.";
  }
  if (form.mechanicFee === "" || !Number.isFinite(mechanicFee) || mechanicFee < 0 || mechanicFee > 999999.99) {
    errors.mechanicFee = "Mechanic fee must be from 0 to 999,999.99.";
  } else if (Number.isFinite(price) && mechanicFee > price) {
    errors.mechanicFee = "Mechanic fee cannot be greater than the service price.";
  }
  if (form.laborOnlyPrice !== "" && (!Number.isFinite(laborOnlyPrice) || laborOnlyPrice < 0 || laborOnlyPrice > 999999.99)) {
    errors.laborOnlyPrice = "Labor-only price must be from 0 to 999,999.99.";
  }
  if (form.laborPriceMin !== "" && (!Number.isFinite(laborPriceMin) || laborPriceMin < 0 || laborPriceMin > 999999.99)) {
    errors.laborPriceMin = "Minimum labor price must be from 0 to 999,999.99.";
  }
  if (form.laborPriceMax !== "" && (!Number.isFinite(laborPriceMax) || laborPriceMax < 0 || laborPriceMax > 999999.99)) {
    errors.laborPriceMax = "Maximum labor price must be from 0 to 999,999.99.";
  } else if (form.laborPriceMin !== "" && form.laborPriceMax !== "" && laborPriceMax < laborPriceMin) {
    errors.laborPriceMax = "Maximum labor price must be greater than or equal to minimum labor price.";
  }
  if (form.durationMinutes === "" || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    errors.durationMinutes = "Duration must be a whole number from 1 to 1,440 minutes.";
  }
  if (form.pricePerUnit && !form.unitLabel.trim()) errors.unitLabel = "Unit name is required when charging per unit.";
  if (form.unitLabel.length > 40) errors.unitLabel = "Unit name must be 40 characters or fewer.";
  if (!Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 10) errors.maxUnits = "Maximum units must be a whole number from 1 to 10.";
  return errors;
};

function Inventory() {
  const [search, setSearch] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    price: "",
    quantity: "",
    category: "",
  });
  const [variantRows, setVariantRows] = useState([]);
  const [variantErrors, setVariantErrors] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [itemFormErrors, setItemFormErrors] = useState({});
  const [itemFormError, setItemFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [imageError, setImageError] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const imageInputRef = useRef(null);
  const variantImageInputRefs = useRef([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState("items");
  const [services, setServices] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [serviceRefreshKey, setServiceRefreshKey] = useState(0);
  const [editingService, setEditingService] = useState(null);
  const [isAddingService, setIsAddingService] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    name: "",
    description: "",
    price: "",
    laborOnlyPrice: "",
    laborPriceMin: "",
    laborPriceMax: "",
    mechanicFee: "",
    category: "General",
    durationMinutes: "60",
    pricePerUnit: false,
    unitLabel: "",
    maxUnits: "2",
    scaleDuration: true,
  });
  const [serviceFormErrors, setServiceFormErrors] = useState({});
  const [serviceFormError, setServiceFormError] = useState("");
  const [isSavingService, setIsSavingService] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toast, setToast] = useState("");

  const updateVariantRow = (index, changes) => {
    setVariantRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
    setVariantErrors((errors) => errors.map((error, rowIndex) => rowIndex === index ? {} : error));
  };

  const addVariantRow = () => {
    setVariantRows((rows) => [...rows, createEmptyVariant()]);
    setVariantErrors((errors) => [...errors, {}]);
  };

  const removeVariantRow = (index) => {
    const row = variantRows[index];
    if (row?.imagePreview.startsWith("blob:")) URL.revokeObjectURL(row.imagePreview);
    setVariantRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    setVariantErrors((errors) => errors.filter((_, rowIndex) => rowIndex !== index));
  };

  const selectVariantImage = (index, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!acceptedTypes.has(file.type) || file.size > 2 * 1024 * 1024) {
      updateVariantRow(index, {
        imageError: acceptedTypes.has(file.type)
          ? "Image must be 2 MB or smaller."
          : "Choose a PNG, JPG, or WEBP image."
      });
      return;
    }
    const current = variantRows[index];
    if (current?.imagePreview.startsWith("blob:")) URL.revokeObjectURL(current.imagePreview);
    updateVariantRow(index, {
      imageFile: file,
      imagePreview: URL.createObjectURL(file),
      removeImage: false,
      imageError: ""
    });
  };

  const removeVariantImage = (index) => {
    const row = variantRows[index];
    if (row?.imagePreview.startsWith("blob:")) URL.revokeObjectURL(row.imagePreview);
    updateVariantRow(index, {
      imageFile: null,
      imagePreview: "",
      removeImage: Boolean(row?.imageUrl || row?.imagePublicId),
      imageError: ""
    });
  };

  const releaseVariantPreviews = (rows) => {
    rows.forEach((row) => {
      if (row.imagePreview.startsWith("blob:")) URL.revokeObjectURL(row.imagePreview);
    });
  };

  useEffect(() => {
    let isMounted = true;

    const loadInventory = () => {
      setIsLoading(true);
      api
        .getInventory(page, 15)
        .then((response) => {
          if (isMounted) {
            const data = response.data || [];
            setInventoryItems(
              data.map((item) => ({
                ...item,
                id: item._id,
                rawPrice: item.price,
                price: `₱${Number(item.price).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}`,
                stock: item.quantity,
                reserved: Number(item.reservedQty || 0),
                available: Number(item.available ?? (item.quantity - Number(item.reservedQty || 0))),
                hasActiveReservation: Boolean(item.hasActiveReservation),
              })),
            );
            setTotalPages(response.pagination?.totalPages || 1);
          }
        })
        .catch((fetchError) => {
          if (isMounted) {
            setError(fetchError.message || "Failed to load inventory");
          }
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    };

    loadInventory();
    const refreshInterval = window.setInterval(loadInventory, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [page, refreshKey]);

  useEffect(() => {
    let isMounted = true;

    api
      .getServices()
      .then((response) => {
        if (isMounted) setServices(response.services || []);
      })
      .catch((fetchError) => {
        if (isMounted) {
          setError(fetchError.message || "Failed to load services");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingServices(false);
      });

    return () => {
      isMounted = false;
    };
  }, [serviceRefreshKey]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const openItemDialog = (item = null) => {
    setEditingItem(item);
    setIsAdding(!item);
    setItemFormErrors({});
    setItemFormError("");
    setImageFile(null);
    setImagePreview(item?.imageUrl || item?.image || "");
    setImageFileName("");
    setImageError("");
    setRemoveImage(false);
    setVariantErrors([]);
    setVariantRows((item?.variants || []).map((variant) => ({
      ...createEmptyVariant(),
      _id: variant._id,
      brand: variant.brand || "",
      model: variant.model || "",
      size: variant.size || "",
      color: variant.color || "",
      price: String(variant.price ?? ""),
      stock: String(variant.stock ?? ""),
      imageUrl: variant.imageUrl || "",
      imagePublicId: variant.imagePublicId || "",
      imagePreview: variant.imageUrl || "",
    })));
    setForm(
      item
        ? {
            name: item.name,
            price: item.rawPrice,
            quantity: item.stock,
            category: item.category || "",
          }
        : { name: "", price: "", quantity: "", category: "" },
    );
  };

  const saveItem = async (event) => {
    event.preventDefault();
    const validationErrors = validateItemForm(form, variantRows);
    const nextVariantErrors = validateVariantRows(variantRows);
    const hasVariantErrors = nextVariantErrors.some((errors) => Object.keys(errors).length);
    setItemFormErrors(validationErrors);
    setVariantErrors(nextVariantErrors);
    setItemFormError("");
    if (Object.keys(validationErrors).length || hasVariantErrors) return;
    setIsSaving(true);
    setError("");

    try {
      const payload = new FormData();
      payload.append("name", form.name);
      const totalStock = variantRows.reduce((total, variant) => total + Number(variant.stock), 0);
      payload.append("price", String(variantRows.length ? Number(variantRows[0].price) : Number(form.price)));
      payload.append("quantity", String(variantRows.length ? totalStock : Number(form.quantity)));
      payload.append("category", form.category);
      if (variantRows.length) {
        payload.append("variants", JSON.stringify(variantRows.map((variant) => ({
          ...(variant._id ? { _id: variant._id } : {}),
          brand: variant.brand.trim(),
          model: variant.model.trim(),
          size: variant.size.trim(),
          color: variant.color.trim(),
          price: Number(variant.price),
          stock: Number(variant.stock),
          ...(variant.removeImage ? { removeImage: true } : {})
        }))));
        variantRows.forEach((variant, index) => {
          if (variant.imageFile) payload.append(`variantImage_${index}`, variant.imageFile);
        });
      } else if (editingItem?.variants?.length) {
        payload.append("variants", "[]");
      }
      if (imageFile) payload.append("image", imageFile);
      if (removeImage) payload.append("removeImage", "true");

      if (editingItem) {
        await api.updateInventory(editingItem.id, payload);
      } else {
        await api.createInventory(payload);
      }

      setEditingItem(null);
      setIsAdding(false);
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      releaseVariantPreviews(variantRows);
      setImageFile(null);
      setImagePreview("");
      setVariantRows([]);
      setVariantErrors([]);
      setPage(1);
      setRefreshKey((key) => key + 1);
      setToast(editingItem ? "Item updated successfully." : "Item added successfully.");
    } catch (saveError) {
      setItemFormErrors(saveError.fieldErrors || {});
      setItemFormError(saveError.message || "Failed to save inventory item");
    } finally {
      setIsSaving(false);
    }
  };

  const openServiceDialog = (service = null) => {
    setEditingService(service);
    setIsAddingService(!service);
    setServiceFormErrors({});
    setServiceFormError("");
    setServiceForm(service
      ? {
          name: service.name,
          description: service.description || "",
          price: String(service.price),
          laborOnlyPrice: service.laborOnlyPrice == null ? "" : String(service.laborOnlyPrice),
          laborPriceMin: service.laborPriceMin == null ? "" : String(service.laborPriceMin),
          laborPriceMax: service.laborPriceMax == null ? "" : String(service.laborPriceMax),
          mechanicFee: String(service.mechanicFee ?? 0),
          category: SERVICE_CATEGORIES.includes(service.category) ? service.category : "General",
          durationMinutes: String(service.durationMinutes || 60),
          pricePerUnit: service.pricePerUnit === true,
          unitLabel: service.unitLabel || "",
          maxUnits: String(service.maxUnits || 2),
          scaleDuration: service.scaleDuration !== false,
        }
      : { name: "", description: "", price: "", laborOnlyPrice: "", laborPriceMin: "", laborPriceMax: "", mechanicFee: "", category: "General", durationMinutes: "60", pricePerUnit: false, unitLabel: "", maxUnits: "2", scaleDuration: true });
  };

  const saveService = async (event) => {
    event.preventDefault();
    const validationErrors = validateServiceForm(serviceForm);
    setServiceFormErrors(validationErrors);
    setServiceFormError("");
    if (Object.keys(validationErrors).length) return;
    setIsSavingService(true);

    try {
      const payload = {
        name: serviceForm.name.trim(),
        description: serviceForm.description,
        price: Number(serviceForm.price),
        laborOnlyPrice: serviceForm.laborOnlyPrice === "" ? null : Number(serviceForm.laborOnlyPrice),
        laborPriceMin: serviceForm.laborPriceMin === "" ? null : Number(serviceForm.laborPriceMin),
        laborPriceMax: serviceForm.laborPriceMax === "" ? null : Number(serviceForm.laborPriceMax),
        mechanicFee: Number(serviceForm.mechanicFee),
        category: serviceForm.category.trim(),
        durationMinutes: Number(serviceForm.durationMinutes),
        pricePerUnit: serviceForm.pricePerUnit,
        unitLabel: serviceForm.unitLabel.trim(),
        maxUnits: Number(serviceForm.maxUnits),
        scaleDuration: serviceForm.scaleDuration,
      };
      if (editingService) await api.updateService(editingService._id, payload);
      else await api.createService(payload);
      setIsAddingService(false);
      setEditingService(null);
      setServiceForm({ name: "", description: "", price: "", laborOnlyPrice: "", laborPriceMin: "", laborPriceMax: "", mechanicFee: "", category: "General", durationMinutes: "60", pricePerUnit: false, unitLabel: "", maxUnits: "2", scaleDuration: true });
      setServiceRefreshKey((key) => key + 1);
      setToast(editingService ? "Service updated successfully." : "Service added successfully.");
    } catch (saveError) {
      setServiceFormErrors(saveError.fieldErrors || {});
      setServiceFormError(saveError.message || "Failed to save service");
    } finally {
      setIsSavingService(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const result = deleteTarget.type === "service"
        ? await api.deleteService(deleteTarget.id)
        : await api.deleteInventory(deleteTarget.id);
      if (deleteTarget.type === "service") {
        setServiceRefreshKey((key) => key + 1);
      } else {
        setRefreshKey((key) => key + 1);
      }
      setPage(1);
      setDeleteTarget(null);
      setToast(result.archived ? "Archived (kept in past records)" : "Deleted");
    } catch (deleteError) {
      setDeleteError(deleteError.message || "Failed to delete record");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredItems = inventoryItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  );
  const serviceRows = services.filter((service) =>
    `${service.name} ${service.description || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const serviceTotalPages = Math.max(1, Math.ceil(serviceRows.length / 15));
  const visibleServiceRows = serviceRows.slice((page - 1) * 15, page * 15);

  const closeItemDialog = () => {
    if (isSaving) return;
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    releaseVariantPreviews(variantRows);
    setEditingItem(null);
    setIsAdding(false);
    setImageFile(null);
    setImagePreview("");
    setImageFileName("");
    setImageError("");
    setRemoveImage(false);
    setVariantRows([]);
    setVariantErrors([]);
  };
  const selectItemImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    setImageFileName(file.name);
    const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!acceptedTypes.has(file.type)) {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImageFile(null);
      setImagePreview(removeImage ? "" : editingItem?.imageUrl || editingItem?.image || "");
      setImageError("Choose a PNG, JPG, or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImageFile(null);
      setImagePreview(removeImage ? "" : editingItem?.imageUrl || editingItem?.image || "");
      setImageError("Image must be 2 MB or smaller.");
      return;
    }

    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };
  const removeItemImage = () => {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    setImageFileName("");
    setImageError("");
    setRemoveImage(true);
  };
  const closeServiceDialog = () => {
    if (isSavingService) return;
    setIsAddingService(false);
    setEditingService(null);
  };
  const openDeleteDialog = (target) => {
    setDeleteError("");
    setDeleteTarget(target);
  };

  return (
    <AdminPageFrame>
      <section className="section-content active">
        <div className="inventory-container">
          {toast && <p className="inventory-toast" role="status">{toast}</p>}
          <div className="inventory-tabs-row">
          <div
            className="inventory-view-toggle"
            role="tablist"
            aria-label="Inventory sections"
          >
            <button
              id="items-tab"
              className={activeTab === "items" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === "items"}
              aria-controls="items-panel"
              onClick={() => {
                setPage(1);
                setActiveTab("items");
              }}
            >
              Items
            </button>
            <button
              id="services-tab"
              className={activeTab === "services" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === "services"}
              aria-controls="services-panel"
              onClick={() => {
                setPage(1);
                setActiveTab("services");
              }}
            >
              Services
            </button>
          </div>
          {activeTab === "items" ? (
            <button
              className="btn-primary"
              type="button"
              onClick={() => openItemDialog()}
            >
              + Add Item
            </button>
          ) : (
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                openServiceDialog();
              }}
            >
              + Add Service
            </button>
          )}
          </div>
          {error && (
            <p className="dashboard-error" role="alert">
              {error}
            </p>
          )}
          {activeTab === "items" ? (
            <div id="items-panel" role="tabpanel" aria-labelledby="items-tab">
              <div className="inventory-header">
                <input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search items..."
                />
              </div>
              <div className="inventory-info">
                {isLoading ? "Loading..." : filteredItems.length} inventory
                items
              </div>
              <div className="inventory-card-list" aria-label="Inventory item cards">
                {isLoading ? <p className="inventory-card-state" role="status">Loading inventory...</p>
                  : filteredItems.length ? filteredItems.map((item) => (
                    <article className="inventory-mobile-card" key={item.id}>
                      <div className="inventory-mobile-card__heading">
                        <ProductImage src={item.imageUrl || item.image} alt="" className="inventory-item-thumbnail" loading="lazy" width={80} fallback={<span className="inventory-item-thumbnail is-placeholder">{String(item.category || "?").charAt(0).toUpperCase()}</span>} />
                        <div className="inventory-mobile-card__name"><strong>{item.name}</strong><span>{item.category}</span></div>
                      </div>
                      <div className="inventory-mobile-card__metrics">
                        <div><span>Price</span><strong>{item.price}</strong></div>
                        <div><span>Stock</span><strong className={stockClass(item.available)}>{item.stock}</strong></div>
                        <div><span>Reserved</span><strong>{item.reserved}</strong></div>
                        <div><span>Available</span><strong className={stockClass(item.available)}>{item.available}</strong></div>
                      </div>
                      {item.variants?.length > 0 && <>
                        <button
                          className="inventory-variant-toggle"
                          type="button"
                          aria-expanded={Boolean(expandedItems[item.id])}
                          onClick={() => setExpandedItems((expanded) => ({
                            ...expanded,
                            [item.id]: !expanded[item.id]
                          }))}
                        >
                          {item.variants.length} variants · {expandedItems[item.id] ? "Hide" : "View"}
                        </button>
                        {expandedItems[item.id] && <div className="inventory-mobile-card__variants">
                          {item.variants.map((variant) => {
                            const available = Math.max(0, Number(variant.stock || 0) - Number(variant.reservedQty || 0));
                            return <div className="inventory-mobile-card__variant" key={variant._id}>
                              <ProductImage src={variant.imageUrl} alt="" className="inventory-item-thumbnail" loading="lazy" width={80} fallback={<span className="inventory-item-thumbnail is-placeholder">V</span>} />
                              <strong>{variant.label || variantLabel(variant)}</strong>
                              <span>{[variant.brand, variant.model, variant.size, variant.color].filter(Boolean).join(" · ") || "Variant"}</span>
                              <span>{formatPrice(variant.price)} · Stock {variant.stock} · Reserved {variant.reservedQty || 0} · <strong className={stockClass(available)}>Available {available}</strong></span>
                            </div>;
                          })}
                        </div>}
                      </>}
                      <div className="inventory-mobile-card__actions">
                        <button className="btn-small btn-edit" type="button" onClick={() => openItemDialog(item)}>Edit</button>
                        <button className="btn-small btn-delete" type="button" disabled={item.hasActiveReservation} title={item.hasActiveReservation ? "Cannot delete an item with an active reservation." : undefined} onClick={() => openDeleteDialog({ type: "item", id: item.id, name: item.name })}>Delete</button>
                        {item.hasActiveReservation && <small className="inventory-field-error">Active reservation</small>}
                      </div>
                    </article>
                  )) : <p className="inventory-card-state">No inventory items match this search.</p>}
              </div>
              <div className="inventory-table-scroll">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>ITEM NAME</th>
                      <th>CATEGORY</th>
                      <th>PRICE</th>
                      <th>STOCK</th>
                      <th>RESERVED</th>
                      <th>AVAILABLE</th>
                      <th>VARIANTS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <Fragment key={item.id}>
                        <tr key={item.id}>
                          <td><span className="inventory-item-name"><ProductImage src={item.imageUrl || item.image} alt="" className="inventory-item-thumbnail" loading="lazy" width={80} fallback={<span className="inventory-item-thumbnail is-placeholder">{String(item.category || "?").charAt(0).toUpperCase()}</span>} /><span>{item.name}</span></span></td>
                          <td>{item.category}</td>
                          <td className="price-text">{item.price}</td>
                          <td className={stockClass(item.available)}>
                            {item.stock}
                          </td>
                          <td>{item.reserved}</td>
                          <td className={stockClass(item.available)}>
                            {item.available}
                          </td>
                          <td>
                            {item.variants?.length ? (
                              <button
                                className="inventory-variant-toggle"
                                type="button"
                                aria-expanded={Boolean(expandedItems[item.id])}
                                aria-label={`${expandedItems[item.id] ? "Hide" : "Show"} ${item.variants.length} variants for ${item.name}`}
                                onClick={() => setExpandedItems((expanded) => ({
                                  ...expanded,
                                  [item.id]: !expanded[item.id]
                                }))}
                              >
                                {item.variants.length} · {expandedItems[item.id] ? "Hide" : "View"}
                              </button>
                            ) : "—"}
                          </td>
                          <td>
                            <button
                              className="btn-small btn-edit"
                              type="button"
                              onClick={() => openItemDialog(item)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-small btn-delete"
                              type="button"
                              disabled={item.hasActiveReservation}
                              title={item.hasActiveReservation ? "Cannot delete an item with an active reservation." : undefined}
                              onClick={() => openDeleteDialog({ type: "item", id: item.id, name: item.name })}
                            >
                              Delete
                            </button>
                            {item.hasActiveReservation && (
                              <small className="inventory-field-error">Active reservation</small>
                            )}
                          </td>
                        </tr>
                        {expandedItems[item.id] && item.variants?.length > 0 && (
                          <tr key={`${item.id}-variants`} className="inventory-variant-details-row">
                            <td colSpan={8}>
                              <div className="inventory-variant-details">
                                {item.variants.map((variant) => {
                                  const available = Math.max(0, Number(variant.stock || 0) - Number(variant.reservedQty || 0));
                                  return (
                                    <div
                                      className={`inventory-variant-detail${available <= 0 ? " is-out-of-stock" : available <= LOW_STOCK_THRESHOLD ? " is-low-stock" : ""}`}
                                      key={variant._id}
                                    >
                                      <ProductImage
                                        src={variant.imageUrl}
                                        alt=""
                                        className="inventory-item-thumbnail"
                                        loading="lazy"
                                        width={80}
                                        fallback={<span className="inventory-item-thumbnail is-placeholder">V</span>}
                                      />
                                      <div className="inventory-variant-description">
                                        <strong>{variant.label || variantLabel(variant)}</strong>
                                        <small>
                                          {[variant.brand, variant.model, variant.size, variant.color].filter(Boolean).join(" · ") || "Variant"}
                                        </small>
                                      </div>
                                      <span>{formatPrice(variant.price)}</span>
                                      <span>Stock: <strong>{variant.stock}</strong></span>
                                      <span>Reserved: {variant.reservedQty || 0}</span>
                                      <span className={stockClass(available)}>
                                        Available: {available}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="pagination-container"
                aria-label="Inventory pagination"
              >
                <button
                  className={`pagination-button${page === 1 ? " disabled" : ""}`}
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
                >
                  Previous
                </button>
                <span className="pagination-page">
                  Page {page} of {totalPages}
                </span>
                <button
                  className={`pagination-button${page >= totalPages ? " disabled" : ""}`}
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div
              id="services-panel"
              role="tabpanel"
              aria-labelledby="services-tab"
            >
              <div className="inventory-header">
                <input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search services..."
                />
              </div>
              <div className="inventory-info">
                {isLoadingServices ? "Loading..." : serviceRows.length}{" "}
                services · mechanic fee per completed service
              </div>
              <div className="inventory-card-list" aria-label="Service cards">
                {isLoadingServices ? <p className="inventory-card-state" role="status">Loading services...</p>
                  : visibleServiceRows.length ? visibleServiceRows.map((service) => (
                    <article className="inventory-mobile-card" key={service._id}>
                      <div className="inventory-mobile-card__name">
                        <strong>{service.name}</strong>
                        <span>{service.category || "General"}</span>
                      </div>
                      {service.description && <p className="inventory-mobile-card__description">{service.description}</p>}
                      <div className="inventory-mobile-card__metrics">
                        <div><span>Price{service.pricePerUnit ? ` / ${service.unitLabel || "unit"}` : ""}</span><strong>{`₱${Number(service.price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}</strong></div>
                        <div><span>Duration</span><strong>{Number(service.durationMinutes) || 60} min{service.pricePerUnit && service.scaleDuration !== false ? ` / ${service.unitLabel || "unit"}` : ""}</strong></div>
                        <div><span>Mechanic fee</span><strong>{`₱${Number(service.mechanicFee || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}</strong></div>
                      </div>
                      <div className="inventory-mobile-card__actions">
                        <button className="btn-small btn-edit" type="button" onClick={() => openServiceDialog(service)}>Edit</button>
                        <button className="btn-small btn-delete" type="button" onClick={() => openDeleteDialog({ type: "service", id: service._id, name: service.name })}>Delete</button>
                      </div>
                    </article>
                  )) : <p className="inventory-card-state">No services match this search.</p>}
              </div>
              <table className="inventory-table inventory-service-table">
                  <thead>
                    <tr>
                      <th>SERVICE</th>
                      <th>CATEGORY</th>
                      <th>PRICE</th>
                      <th>DURATION</th>
                      <th>MECHANIC FEE</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleServiceRows.map((service) => (
                      <tr key={service._id}>
                        <td>
                          <span>{service.name}</span>
                          {service.description && (
                            <small className="inventory-service-description" title={service.description}>
                              {service.description}
                            </small>
                          )}
                        </td>
                        <td>{service.category || "General"}</td>
                        <td className="price-text">
                          {`₱${Number(service.price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
                          {service.pricePerUnit && ` / ${service.unitLabel || "unit"}`}
                        </td>
                        <td>{Number(service.durationMinutes) || 60} min{service.pricePerUnit && service.scaleDuration !== false ? ` / ${service.unitLabel || "unit"}` : ""}</td>
                        <td className="price-text">
                          {`₱${Number(service.mechanicFee || 0).toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                            })}`}
                        </td>
                        <td>
                            <button
                              className="btn-small btn-edit"
                              type="button"
                              onClick={() => openServiceDialog(service)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-small btn-delete"
                              type="button"
                              onClick={() => openDeleteDialog({ type: "service", id: service._id, name: service.name })}
                            >
                              Delete
                            </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </table>
              <div className="pagination-container" aria-label="Services pagination">
                <button
                  className={`pagination-button${page === 1 ? " disabled" : ""}`}
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
                >
                  Previous
                </button>
                <span className="pagination-page">Page {page} of {serviceTotalPages}</span>
                <button
                  className={`pagination-button${page >= serviceTotalPages ? " disabled" : ""}`}
                  type="button"
                  disabled={page >= serviceTotalPages}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      {(isAdding || editingItem) && (
        <AdminDialog
          title={editingItem ? "Edit Inventory Item" : "Add Inventory Item"}
          onClose={closeItemDialog}
          footer={<div className="admin-dialog-actions">
            <button className="btn-small" type="button" onClick={closeItemDialog}>Cancel</button>
            <button className="btn-primary" type="submit" form="inventory-item-form" disabled={isSaving}>{isSaving ? imageFile ? "Uploading image..." : "Saving..." : "Save Item"}</button>
          </div>}
        >
          <form id="inventory-item-form" className="admin-dialog-form" noValidate onSubmit={saveItem}>
            {itemFormError && <p className="admin-dialog-error" role="alert">{itemFormError}</p>}
            <label>
              Name
              <input
                minLength="2"
                maxLength="80"
                aria-invalid={Boolean(itemFormErrors.name)}
                value={form.name}
                onChange={(event) => {
                  setForm({ ...form, name: event.target.value });
                  setItemFormErrors((errors) => ({ ...errors, name: "" }));
                }}
              />
              {itemFormErrors.name && <small className="inventory-field-error">{itemFormErrors.name}</small>}
            </label>
            {variantRows.length === 0 ? (
              <>
                <label>
                  Service price
                  <input
                    min="0.01"
                    max="999999.99"
                    step="0.01"
                    type="number"
                    aria-invalid={Boolean(itemFormErrors.price)}
                    value={form.price}
                    onChange={(event) => {
                      setForm({ ...form, price: event.target.value });
                      setItemFormErrors((errors) => ({ ...errors, price: "" }));
                    }}
                  />
                  {itemFormErrors.price && <small className="inventory-field-error">{itemFormErrors.price}</small>}
                </label>
                <label>
                  Stock
                  <input
                    min="0"
                    max="99999"
                    step="1"
                    type="number"
                    aria-invalid={Boolean(itemFormErrors.quantity)}
                    value={form.quantity}
                    onChange={(event) => {
                      setForm({ ...form, quantity: event.target.value });
                      setItemFormErrors((errors) => ({ ...errors, quantity: "" }));
                    }}
                  />
                  {itemFormErrors.quantity && <small className="inventory-field-error">{itemFormErrors.quantity}</small>}
                </label>
              </>
            ) : (
              <p className="inventory-computed-stock">
                Total stock across {variantRows.length} variants:{" "}
                <strong>{variantRows.reduce((total, variant) => total + (Number(variant.stock) || 0), 0)}</strong>
              </p>
            )}
            <label>
              Category
              <select
                aria-invalid={Boolean(itemFormErrors.category)}
                value={form.category}
                onChange={(event) => {
                  setForm({ ...form, category: event.target.value });
                  setItemFormErrors((errors) => ({ ...errors, category: "" }));
                }}
              >
                <option value="">Choose a category</option>
                {form.category && !PRODUCT_CATEGORIES.includes(form.category) && (
                  <option value={form.category}>{form.category} (old category — choose a listed category)</option>
                )}
                {PRODUCT_CATEGORIES.map((itemCategory) => (
                  <option key={itemCategory} value={itemCategory}>{itemCategory}</option>
                ))}
              </select>
              {itemFormErrors.category && <small className="inventory-field-error">{itemFormErrors.category}</small>}
            </label>
            <section className="inventory-variants-section" aria-labelledby="inventory-variants-title">
              <div className="inventory-variants-heading">
                <div>
                  <h3 id="inventory-variants-title">Variants</h3>
                  <small>Optional for any category. Add at least one attribute per variant.</small>
                </div>
                <button className="btn-small" type="button" onClick={addVariantRow}>Add variant</button>
              </div>
              <datalist id="inventory-variant-brands">
                {["Honda", "Yamaha", "Suzuki", "Kawasaki", "Kymco", "Rusi", "Skygo"].map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
              {variantRows.length === 0 && (
                <p className="inventory-variants-empty">No variants. This item uses its own price and stock.</p>
              )}
              {variantRows.map((variant, index) => (
                <fieldset className="inventory-variant-editor" key={variant._id || `new-${index}`}>
                  <legend>Variant {index + 1}</legend>
                  <div className="inventory-variant-fields">
                    <label>
                      Brand
                      <input
                        list="inventory-variant-brands"
                        maxLength="120"
                        value={variant.brand}
                        onChange={(event) => updateVariantRow(index, { brand: event.target.value })}
                      />
                    </label>
                    <label>
                      Model
                      <input
                        maxLength="120"
                        value={variant.model}
                        onChange={(event) => updateVariantRow(index, { model: event.target.value })}
                      />
                    </label>
                    <label>
                      Size
                      <input
                        maxLength="120"
                        value={variant.size}
                        onChange={(event) => updateVariantRow(index, { size: event.target.value })}
                      />
                    </label>
                    <label>
                      Color
                      <input
                        maxLength="120"
                        value={variant.color}
                        onChange={(event) => updateVariantRow(index, { color: event.target.value })}
                      />
                    </label>
                    <label>
                      Price
                      <input
                        min="0.01"
                        step="0.01"
                        type="number"
                        aria-invalid={Boolean(variantErrors[index]?.price)}
                        value={variant.price}
                        onChange={(event) => updateVariantRow(index, { price: event.target.value })}
                      />
                      {variantErrors[index]?.price && <small className="inventory-field-error">{variantErrors[index].price}</small>}
                    </label>
                    <label>
                      Stock
                      <input
                        min="0"
                        step="1"
                        type="number"
                        aria-invalid={Boolean(variantErrors[index]?.stock)}
                        value={variant.stock}
                        onChange={(event) => updateVariantRow(index, { stock: event.target.value })}
                      />
                      {variantErrors[index]?.stock && <small className="inventory-field-error">{variantErrors[index].stock}</small>}
                    </label>
                  </div>
                  {variantErrors[index]?.attributes && (
                    <small className="inventory-field-error" role="alert">{variantErrors[index].attributes}</small>
                  )}
                  <div className="inventory-variant-image-row">
                    {variant.imagePreview && !variant.removeImage
                      ? <img className="inventory-variant-image-preview" src={variant.imagePreview} alt={`Variant ${index + 1} preview`} />
                      : <div className="inventory-variant-image-preview is-empty">No image</div>}
                    <div className="inventory-image-actions">
                      <input
                        ref={(element) => { variantImageInputRefs.current[index] = element; }}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        onChange={(event) => selectVariantImage(index, event)}
                        hidden
                      />
                      <button className="btn-small" type="button" onClick={() => variantImageInputRefs.current[index]?.click()}>
                        {variant.imagePreview && !variant.removeImage ? "Replace photo" : "Choose photo"}
                      </button>
                      {variant.imagePreview && !variant.removeImage && (
                        <button className="btn-small btn-delete" type="button" onClick={() => removeVariantImage(index)}>Remove photo</button>
                      )}
                      {!variant.imageError && <small>PNG, JPG, or WEBP · up to 2 MB</small>}
                      {variant.imageError && <small className="inventory-field-error" role="alert">{variant.imageError}</small>}
                    </div>
                    <button className="btn-small btn-delete" type="button" onClick={() => removeVariantRow(index)}>
                      Remove variant
                    </button>
                  </div>
                </fieldset>
              ))}
            </section>
            <div className="inventory-image-field">
              <span>Image <small>(optional)</small></span>
              <div className="inventory-image-controls">
                {imagePreview && !removeImage
                  ? <img className="inventory-image-preview" src={imagePreview} alt="Product image preview" />
                  : <div className="inventory-image-preview is-empty" aria-label="No product image selected">No image</div>}
                <div className="inventory-image-actions">
                  <input ref={imageInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={selectItemImage} hidden />
                  <button className="btn-small" type="button" onClick={() => imageInputRef.current?.click()}>{imagePreview && !removeImage ? "Replace" : "Choose image"}</button>
                  {imagePreview && !removeImage && <button className="btn-small btn-delete" type="button" onClick={removeItemImage}>Remove</button>}
                  <small className="inventory-image-filename">{imageFileName || (imagePreview ? "Current image" : "No image selected")}</small>
                </div>
              </div>
              {imageError && <small className="inventory-field-error" role="alert">{imageError}</small>}
              {!imageError && <small>PNG, JPG, or WEBP · up to 2 MB</small>}
            </div>
          </form>
        </AdminDialog>
      )}
      {(isAddingService || editingService) && (
        <AdminDialog
          title={editingService ? "Edit Service" : "Add Service"}
          onClose={closeServiceDialog}
          footer={<div className="admin-dialog-actions">
            <button className="btn-small" type="button" disabled={isSavingService} onClick={closeServiceDialog}>Cancel</button>
            <button className="btn-primary" type="submit" form="inventory-service-form" disabled={isSavingService}>{isSavingService ? "Saving..." : editingService ? "Save" : "Add Service"}</button>
          </div>}
        >
          <form id="inventory-service-form" className="admin-dialog-form" noValidate onSubmit={saveService}>
            {serviceFormError && <p className="admin-dialog-error" role="alert">{serviceFormError}</p>}
            <label>
              Name
              <input
                minLength="2"
                maxLength="80"
                aria-invalid={Boolean(serviceFormErrors.name)}
                value={serviceForm.name}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, name: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, name: "" }));
                }}
              />
              {serviceFormErrors.name && <small className="inventory-field-error">{serviceFormErrors.name}</small>}
            </label>
            <label>
              Description
              <textarea
                maxLength="300"
                aria-invalid={Boolean(serviceFormErrors.description)}
                value={serviceForm.description}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, description: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, description: "" }));
                }}
              />
              <small className="inventory-description-count">{serviceForm.description.length}/300</small>
              {serviceFormErrors.description && <small className="inventory-field-error">{serviceFormErrors.description}</small>}
            </label>
            <label>
              Category
              <select
                aria-invalid={Boolean(serviceFormErrors.category)}
                value={serviceForm.category}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, category: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, category: "" }));
                }}
              >
                {SERVICE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              {serviceFormErrors.category && <small className="inventory-field-error">{serviceFormErrors.category}</small>}
            </label>
            <label>
              Duration (minutes)
              <input
                min="1"
                max="1440"
                step="1"
                type="number"
                aria-invalid={Boolean(serviceFormErrors.durationMinutes)}
                value={serviceForm.durationMinutes}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, durationMinutes: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, durationMinutes: "" }));
                }}
              />
              {serviceFormErrors.durationMinutes && <small className="inventory-field-error">{serviceFormErrors.durationMinutes}</small>}
            </label>
            <label>
              Price
              <input
                min="0.01"
                max="999999.99"
                step="0.01"
                type="number"
                aria-invalid={Boolean(serviceFormErrors.price)}
                value={serviceForm.price}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, price: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, price: "", mechanicFee: "" }));
                }}
              />
              {serviceFormErrors.price && <small className="inventory-field-error">{serviceFormErrors.price}</small>}
            </label>
            <label>
              Labor price range minimum
              <input
                min="0"
                max="999999.99"
                step="0.01"
                type="number"
                aria-invalid={Boolean(serviceFormErrors.laborPriceMin)}
                value={serviceForm.laborPriceMin}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, laborPriceMin: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, laborPriceMin: "", laborPriceMax: "" }));
                }}
              />
              {serviceFormErrors.laborPriceMin && <small className="inventory-field-error">{serviceFormErrors.laborPriceMin}</small>}
            </label>
            <label>
              Labor price range maximum
              <input
                min="0"
                max="999999.99"
                step="0.01"
                type="number"
                aria-invalid={Boolean(serviceFormErrors.laborPriceMax)}
                value={serviceForm.laborPriceMax}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, laborPriceMax: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, laborPriceMax: "" }));
                }}
              />
              {serviceFormErrors.laborPriceMax && <small className="inventory-field-error">{serviceFormErrors.laborPriceMax}</small>}
            </label>
            <label>
              Fixed labor-only price (legacy)
              <input
                min="0"
                max="999999.99"
                step="0.01"
                type="number"
                aria-invalid={Boolean(serviceFormErrors.laborOnlyPrice)}
                value={serviceForm.laborOnlyPrice}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, laborOnlyPrice: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, laborOnlyPrice: "" }));
                }}
              />
              {serviceFormErrors.laborOnlyPrice && <small className="inventory-field-error">{serviceFormErrors.laborOnlyPrice}</small>}
            </label>
            <label>
              Mechanic fee (added to the price)
              <input
                min="0"
                max="999999.99"
                step="0.01"
                type="number"
                aria-invalid={Boolean(serviceFormErrors.mechanicFee)}
                value={serviceForm.mechanicFee}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, mechanicFee: event.target.value });
                  setServiceFormErrors((errors) => ({ ...errors, mechanicFee: "" }));
                }}
              />
              {serviceFormErrors.mechanicFee && <small className="inventory-field-error">{serviceFormErrors.mechanicFee}</small>}
            </label>
            <label>
              <span><input
                type="checkbox"
                checked={serviceForm.pricePerUnit}
                onChange={(event) => {
                  setServiceForm({ ...serviceForm, pricePerUnit: event.target.checked });
                  setServiceFormErrors((errors) => ({ ...errors, unitLabel: "" }));
                }}
              /> Charge per unit</span>
            </label>
            {serviceForm.pricePerUnit && <>
              <label>
                Unit name
                <input
                  maxLength="40"
                  placeholder="wheel hub"
                  aria-invalid={Boolean(serviceFormErrors.unitLabel)}
                  value={serviceForm.unitLabel}
                  onChange={(event) => {
                    setServiceForm({ ...serviceForm, unitLabel: event.target.value });
                    setServiceFormErrors((errors) => ({ ...errors, unitLabel: "" }));
                  }}
                />
                {serviceFormErrors.unitLabel && <small className="inventory-field-error">{serviceFormErrors.unitLabel}</small>}
              </label>
              <label>
                Maximum units
                <input
                  min="1"
                  max="10"
                  step="1"
                  type="number"
                  aria-invalid={Boolean(serviceFormErrors.maxUnits)}
                  value={serviceForm.maxUnits}
                  onChange={(event) => {
                    setServiceForm({ ...serviceForm, maxUnits: event.target.value });
                    setServiceFormErrors((errors) => ({ ...errors, maxUnits: "" }));
                  }}
                />
                {serviceFormErrors.maxUnits && <small className="inventory-field-error">{serviceFormErrors.maxUnits}</small>}
              </label>
              <label>
                <span><input
                  type="checkbox"
                  checked={serviceForm.scaleDuration}
                  onChange={(event) => setServiceForm({ ...serviceForm, scaleDuration: event.target.checked })}
                /> Longer duration for each unit</span>
              </label>
              <small>{`Customer pays ${formatPrice(Number(serviceForm.price || 0) + Number(serviceForm.mechanicFee || 0))} per ${serviceForm.unitLabel || "unit"}.`}</small>
            </>}
          </form>
        </AdminDialog>
      )}
      {deleteTarget && (
        <AdminDialog
          title="Confirm deletion"
          onClose={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
          footer={<div className="admin-dialog-actions">
            <button className="btn-small" type="button" disabled={isDeleting} onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>Cancel</button>
            <button className="btn-small btn-delete" type="button" disabled={isDeleting} onClick={confirmDelete}>{isDeleting ? "Deleting..." : "Delete"}</button>
          </div>}
        >
          {deleteError && <p className="admin-dialog-error" role="alert">{deleteError}</p>}
          <p className="inventory-delete-message">
            Delete &quot;{deleteTarget.name}&quot;? This cannot be undone.
          </p>
        </AdminDialog>
      )}
    </AdminPageFrame>
  );
}

export default Inventory;
