// Include detail kwitansi — dipisah dari payments.service agar bisa dipakai
// modul lain (public controller, notifications) tanpa circular import.
export const receiptDetailInclude = {
  payment: {
    select: {
      id: true,
      method: true,
      channel: true,
      provider: true,
      providerRef: true,
      paidAt: true,
    },
  },
  invoice: {
    select: {
      id: true,
      number: true,
      studentId: true,
      packageId: true,
      enrollmentId: true,
      createdAt: true,
      totalAmount: true,
      amountPaid: true,
      issuedAt: true,
      dueDate: true,
      student: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
          parentStudents: {
            select: {
              parent: { select: { user: { select: { name: true } } } },
            },
            take: 2,
          },
        },
      },
      package: { select: { id: true, name: true, code: true } },
      enrollmentLink: {
        select: {
          program: { select: { name: true } },
          level: { select: { name: true } },
          group: { select: { name: true } },
        },
      },
      enrollment: {
        select: {
          program: { select: { name: true } },
          level: { select: { name: true } },
          group: { select: { name: true } },
        },
      },
      items: {
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPrice: true,
          amount: true,
        },
      },
    },
  },
} as const;
