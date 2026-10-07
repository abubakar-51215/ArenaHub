/** TanStack Query hooks for the admin panel. */
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveArena,
  deleteUser,
  fetchDashboardMetrics,
  fetchPlatformSettings,
  getUserDetail,
  listAllBookings,
  listAllPayments,
  getAdminArena,
  listArenaQueue,
  listAuditLogs,
  listUsers,
  reactivateUser,
  rejectArena,
  suspendUser,
  updatePlatformSettings,
} from "@/services/admin";
import { listComplaints, respondToComplaint } from "@/services/complaints";
import { deleteReview, dismissReviewReport, listReportedReviews } from "@/services/reviews";
import type {
  ArenaStatus,
  BookingStatus,
  ComplaintCategory,
  ComplaintStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@/types";

export function useDashboardMetrics() {
  return useQuery({ queryKey: ["admin-dashboard"], queryFn: fetchDashboardMetrics });
}

export function useArenaQueue(status: ArenaStatus, page: number) {
  return useQuery({
    queryKey: ["admin-arenas", status, page],
    queryFn: () => listArenaQueue(status, page),
  });
}

/** Every arena, for the Arenas directory. The queue endpoint lists one
 *  status at a time, so this asks for each (up to 100 per status) and puts
 *  them together. The keys sit under "admin-arenas", so approving or
 *  rejecting refreshes them too. */
export function useArenaDirectory() {
  const statuses = ["approved", "pending", "rejected"] as const;
  const results = useQueries({
    queries: statuses.map((status) => ({
      queryKey: ["admin-arenas", status, "directory"],
      queryFn: () => listArenaQueue(status, 1, 100),
    })),
  });
  const [approved, pending, rejected] = results;
  const done = results.every((r) => r.data);
  return {
    arenas: results
      .flatMap((r) => r.data?.items ?? [])
      .sort((a, b) => a.name.localeCompare(b.name)),
    totals: done
      ? {
          approved: approved.data!.total,
          pending: pending.data!.total,
          rejected: rejected.data!.total,
        }
      : undefined,
    truncated: results.some((r) => r.data && r.data.total > r.data.items.length),
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

export function useAdminArena(arenaId: string | null) {
  return useQuery({
    queryKey: ["admin-arena", arenaId],
    queryFn: () => getAdminArena(arenaId as string),
    enabled: !!arenaId,
  });
}

export function useArenaVerification() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-arenas"] });
  const approve = useMutation({ mutationFn: approveArena, onSuccess: invalidate });
  const reject = useMutation({
    mutationFn: ({ arenaId, reason }: { arenaId: string; reason: string }) =>
      rejectArena(arenaId, reason),
    onSuccess: invalidate,
  });
  return { approve, reject };
}

export function useUsers(params: {
  role?: UserRole;
  search?: string;
  is_active?: boolean;
  page: number;
}) {
  return useQuery({
    queryKey: [
      "admin-users",
      params.role ?? "",
      params.search ?? "",
      params.is_active ?? "",
      params.page,
    ],
    queryFn: () => listUsers(params),
  });
}

export function useUserDetail(userId: string | null) {
  return useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => getUserDetail(userId as string),
    enabled: !!userId,
  });
}

export function useUserActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  const suspend = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      suspendUser(userId, reason),
    onSuccess: invalidate,
  });
  const reactivate = useMutation({ mutationFn: reactivateUser, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteUser, onSuccess: invalidate });
  return { suspend, reactivate, remove };
}

export function useAllBookings(params: {
  status?: BookingStatus;
  date_from?: string;
  date_to?: string;
  page: number;
}) {
  return useQuery({
    queryKey: [
      "admin-bookings",
      params.status ?? "",
      params.date_from ?? "",
      params.date_to ?? "",
      params.page,
    ],
    queryFn: () => listAllBookings(params),
  });
}

export function useAllPayments(params: {
  status?: PaymentStatus;
  method?: PaymentMethod;
  date_from?: string;
  date_to?: string;
  page: number;
}) {
  return useQuery({
    queryKey: [
      "admin-payments",
      params.status ?? "",
      params.method ?? "",
      params.date_from ?? "",
      params.date_to ?? "",
      params.page,
    ],
    queryFn: () => listAllPayments(params),
  });
}

export function useComplaints(params: {
  status?: ComplaintStatus;
  category?: ComplaintCategory;
  page: number;
}) {
  return useQuery({
    queryKey: ["admin-complaints", params.status ?? "", params.category ?? "", params.page],
    queryFn: () => listComplaints(params),
  });
}

export function useComplaintActions() {
  const qc = useQueryClient();
  const respond = useMutation({
    mutationFn: ({
      complaintId,
      adminResponse,
      status,
    }: {
      complaintId: string;
      adminResponse: string;
      status: ComplaintStatus;
    }) => respondToComplaint(complaintId, adminResponse, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-complaints"] }),
  });
  return { respond };
}

export function useReportedReviews(page: number) {
  return useQuery({
    queryKey: ["admin-reported-reviews", page],
    queryFn: () => listReportedReviews(page),
  });
}

export function useReviewModeration() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-reported-reviews"] });
  const dismiss = useMutation({ mutationFn: dismissReviewReport, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteReview, onSuccess: invalidate });
  return { dismiss, remove };
}

export function useAuditLogs(page: number) {
  return useQuery({ queryKey: ["admin-audit-logs", page], queryFn: () => listAuditLogs(page) });
}

export function usePlatformSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin-settings"], queryFn: fetchPlatformSettings });
  const update = useMutation({
    mutationFn: updatePlatformSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-settings"] }),
  });
  return { ...query, update };
}
