import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#root/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#root/components/ui/table";
import { Button } from "#root/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#root/components/ui/alert-dialog";
import { Star, Trash2, Loader2, Check, X, Eye } from "lucide-react";
import { Badge } from "#root/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#root/components/ui/dialog";
import { trpc } from "#root/shared/trpc/client";
import { toast } from "sonner";

interface Review {
  id: string;
  productId: string;
  productName: string;
  userId: string | null;
  userName: string;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected";
  imageUrl: string | null;
  createdAt: Date | string;
}

function StatusBadge({ status }: { status: Review["status"] }) {
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Approved
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
        Rejected
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
      Pending
    </Badge>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [viewingReview, setViewingReview] = useState<Review | null>(null);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await trpc.product.getAllReviews.query({ limit: 100 });
      if (result.success) {
        setReviews(result.result.reviews as Review[]);
      }
    } catch (err) {
      console.error("Failed to fetch reviews:", err);
      toast.error("Failed to load reviews");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const result = await trpc.product.deleteReview.mutate({ reviewId: deleteId });
      if (result.success) {
        toast.success("Review deleted");
        setReviews((prev) => prev.filter((r) => r.id !== deleteId));
      } else {
        toast.error("Failed to delete review");
      }
    } catch (err) {
      console.error("Failed to delete review:", err);
      toast.error("Failed to delete review");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const handleModerate = async (
    reviewId: string,
    status: "approved" | "rejected",
  ) => {
    setModeratingId(reviewId);
    try {
      const result = await trpc.product.moderateReview.mutate({
        reviewId,
        status,
      });
      if (result.success) {
        toast.success(status === "approved" ? "Review approved" : "Review rejected");
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? { ...r, status } : r)),
        );
      } else {
        toast.error("Failed to update review");
      }
    } catch (err) {
      console.error("Failed to moderate review:", err);
      toast.error("Failed to update review");
    } finally {
      setModeratingId(null);
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-6 w-full h-full mx-auto">
      <div className="flex flex-col gap-2 mb-6">
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="text-slate-500">
          Manage customer reviews across all products
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Reviews ({reviews.length})</CardTitle>
          <CardDescription>
            View and manage product reviews. Delete inappropriate or spam reviews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No reviews yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="min-w-[200px]">Comment</TableHead>
                  <TableHead>Photo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow
                    key={review.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setViewingReview(review)}>
                    <TableCell className="font-medium max-w-[150px] truncate">
                      {review.productName}
                    </TableCell>
                    <TableCell>{review.userName}</TableCell>
                    <TableCell>
                      <StarRating rating={review.rating} />
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="line-clamp-2 text-sm text-slate-600">
                        {review.comment}
                      </p>
                    </TableCell>
                    <TableCell>
                      {review.imageUrl ? (
                        <img
                          src={review.imageUrl}
                          alt="Review attachment"
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={review.status} />
                    </TableCell>
                    <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                      {formatDate(review.createdAt)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewingReview(review)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {review.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            disabled={moderatingId === review.id}
                            onClick={() => handleModerate(review.id, "approved")}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {review.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-50"
                            disabled={moderatingId === review.id}
                            onClick={() => handleModerate(review.id, "rejected")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteId(review.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Review</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this review? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Detail Dialog */}
      <Dialog
        open={!!viewingReview}
        onOpenChange={(open) => !open && setViewingReview(null)}>
        <DialogContent className="sm:max-w-lg">
          {viewingReview && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingReview.productName}</DialogTitle>
                <DialogDescription>
                  {viewingReview.userName} · {formatDate(viewingReview.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <StarRating rating={viewingReview.rating} />
                  <StatusBadge status={viewingReview.status} />
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {viewingReview.comment}
                </p>
                {viewingReview.imageUrl && (
                  <img
                    src={viewingReview.imageUrl}
                    alt="Review attachment"
                    className="w-full max-h-96 object-contain rounded-md border"
                  />
                )}
                <div className="flex items-center justify-end gap-2 pt-2">
                  {viewingReview.status !== "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      disabled={moderatingId === viewingReview.id}
                      onClick={() => {
                        handleModerate(viewingReview.id, "approved");
                        setViewingReview((prev) =>
                          prev ? { ...prev, status: "approved" } : prev,
                        );
                      }}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  )}
                  {viewingReview.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={moderatingId === viewingReview.id}
                      onClick={() => {
                        handleModerate(viewingReview.id, "rejected");
                        setViewingReview((prev) =>
                          prev ? { ...prev, status: "rejected" } : prev,
                        );
                      }}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
