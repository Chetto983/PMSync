/**
 * DealProductsTab — shows linked products for a deal with add/remove.
 * Calculates subtotal per line and total for the deal.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  Skeleton,
  Alert,
} from '@mui/material';
import { Plus, Trash2, Search, Package } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useDealProducts,
  useLinkDealProduct,
  useUnlinkDealProduct,
  useProducts,
} from '@/hooks/queries/use-crm-products';
import type { CrmProduct } from '@/lib/api/crm-products';
import type { DealProductLink } from '@/lib/api/crm-products';
import { useGlobalToast } from '@/lib/context/toast-context';

function calcSubtotal(link: DealProductLink): number {
  const qty = link.quantity;
  const price = parseFloat(link.unitPrice);
  const disc = parseFloat(link.discount);
  return qty * price * (1 - disc / 100);
}

function formatCurrency(value: number, currency?: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency ?? 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

// ---- Add Product Dialog ----

function AddProductDialog({
  open,
  onClose,
  dealId,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
}) {
  const t = useTranslations();
  const tp = t.crmDeals?.detail?.dealProducts;
  const toast = useGlobalToast();

  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CrmProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [discount, setDiscount] = useState('0');

  const { data: productsData, isLoading } = useProducts({
    search: search || undefined,
    isActive: true,
    limit: 20,
  });
  const linkProduct = useLinkDealProduct();

  const products = productsData?.data ?? [];

  const handleSelect = (product: CrmProduct) => {
    setSelectedProduct(product);
    setUnitPrice(product.price);
  };

  const handleSubmit = async () => {
    if (!selectedProduct) return;
    const parsedPrice = parseFloat(unitPrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) return;

    try {
      await linkProduct.mutateAsync({
        dealId,
        dto: {
          productId: selectedProduct.id,
          quantity,
          unitPrice: parsedPrice,
          discount: parseFloat(discount) || 0,
        },
      });
      toast.success(tp?.linked ?? 'Product linked');
      handleClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr?.response?.status === 409) {
        toast.error(tp?.alreadyLinked ?? 'Already linked');
      } else {
        toast.error(t.common.genericError);
      }
    }
  };

  const handleClose = () => {
    setSearch('');
    setSelectedProduct(null);
    setQuantity(1);
    setUnitPrice('');
    setDiscount('0');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tp?.addProduct ?? 'Add Product'}</DialogTitle>
      <DialogContent>
        {!selectedProduct ? (
          <>
            <TextField
              placeholder={tp?.searchProducts ?? 'Search products...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              fullWidth
              sx={{ mt: 1, mb: 2 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} />
                    </InputAdornment>
                  ),
                },
              }}
            />

            {isLoading && (
              <Box>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />
                ))}
              </Box>
            )}

            <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
              {products.map((product: CrmProduct) => (
                <Box
                  key={product.id}
                  onClick={() => handleSelect(product)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 1,
                    px: 1.5,
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Package size={16} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={500}>
                      {product.name}
                    </Typography>
                    {product.code && (
                      <Typography variant="caption" color="text.secondary">
                        {product.code}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(parseFloat(product.price), product.currency)}
                  </Typography>
                </Box>
              ))}
              {!isLoading && products.length === 0 && search && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  {t.contacts?.noContactsFound ?? 'No results'}
                </Typography>
              )}
            </Box>
          </>
        ) : (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, p: 1.5, bgcolor: 'action.selected', borderRadius: 1 }}>
              <Package size={16} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={500}>{selectedProduct.name}</Typography>
                {selectedProduct.code && (
                  <Typography variant="caption" color="text.secondary">{selectedProduct.code}</Typography>
                )}
              </Box>
              <Button size="small" onClick={() => setSelectedProduct(null)}>
                {t.common?.edit ?? 'Change'}
              </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label={tp?.form?.quantity ?? 'Quantity'}
                type="number"
                size="small"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                slotProps={{ htmlInput: { min: 1 } }}
                sx={{ flex: 1 }}
              />
              <TextField
                label={tp?.form?.unitPrice ?? 'Unit Price'}
                type="number"
                size="small"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                sx={{ flex: 1 }}
              />
              <TextField
                label={tp?.form?.discount ?? 'Discount %'}
                type="number"
                size="small"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.common?.cancel ?? 'Cancel'}</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!selectedProduct || linkProduct.isPending}
        >
          {tp?.addProduct ?? 'Add Product'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Main Component ----

export function DealProductsTab({ dealId }: { dealId: string }) {
  const t = useTranslations();
  const tp = t.crmDeals?.detail?.dealProducts;
  const toast = useGlobalToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const { data: links, isLoading, isError } = useDealProducts(dealId);
  const unlinkProduct = useUnlinkDealProduct();

  const handleUnlink = async () => {
    if (!confirmUnlinkId) return;
    try {
      await unlinkProduct.mutateAsync({ dealId, linkId: confirmUnlinkId });
      toast.success(tp?.unlinked ?? 'Product removed');
    } catch {
      toast.error(t.common.genericError);
    } finally {
      setConfirmUnlinkId(null);
    }
  };

  if (isLoading) {
    return (
      <Box>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={48} sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">{t.common.genericError}</Alert>;
  }

  const products = links ?? [];
  const total = products.reduce((sum, link) => sum + calcSubtotal(link), 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2">
          {tp?.title ?? 'Linked Products'} ({products.length})
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Plus size={16} />}
          onClick={() => setDialogOpen(true)}
        >
          {tp?.addProduct ?? 'Add Product'}
        </Button>
      </Box>

      {products.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" gutterBottom>
            {tp?.noProducts ?? 'No products linked'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tp?.noProductsDescription ?? 'Link products to calculate the deal value.'}
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<Plus size={16} />}
            onClick={() => setDialogOpen(true)}
          >
            {tp?.addProduct ?? 'Add Product'}
          </Button>
        </Box>
      ) : (
        <>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tp?.columns?.name ?? 'Product'}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{tp?.columns?.code ?? 'Code'}</TableCell>
                  <TableCell align="right">{tp?.columns?.quantity ?? 'Qty'}</TableCell>
                  <TableCell align="right">{tp?.columns?.unitPrice ?? 'Unit Price'}</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{tp?.columns?.discount ?? 'Discount'}</TableCell>
                  <TableCell align="right">{tp?.columns?.subtotal ?? 'Subtotal'}</TableCell>
                  <TableCell width={50} />
                </TableRow>
              </TableHead>
              <TableBody>
                {products.map((link: DealProductLink) => {
                  const subtotal = calcSubtotal(link);
                  return (
                    <TableRow key={link.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {link.product.name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Typography variant="body2" color="text.secondary">
                          {link.product.code || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{link.quantity}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(parseFloat(link.unitPrice), link.product.currency)}
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        {parseFloat(link.discount) > 0
                          ? `${parseFloat(link.discount)}%`
                          : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(subtotal, link.product.currency)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => setConfirmUnlinkId(link.id)}
                          sx={{ minWidth: 44, minHeight: 44 }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, pr: 7 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {tp?.total ?? 'Total'}: {formatCurrency(total)}
            </Typography>
          </Box>
        </>
      )}

      <AddProductDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dealId={dealId}
      />

      <Dialog
        open={!!confirmUnlinkId}
        onClose={() => setConfirmUnlinkId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{tp?.removeProduct ?? 'Remove Product'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {tp?.removeConfirm ?? 'Remove this product from the deal?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmUnlinkId(null)}
            disabled={unlinkProduct.isPending}
          >
            {t.common?.cancel ?? 'Cancel'}
          </Button>
          <Button
            onClick={handleUnlink}
            variant="contained"
            color="error"
            disabled={unlinkProduct.isPending}
          >
            {tp?.removeButton ?? 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
