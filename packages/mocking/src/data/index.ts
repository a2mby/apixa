/**
 * Typed records for the small synthetic datasets, plus entity types for every dataset
 * `defineMockApi()` can load. Records come straight from the root `datasets/` JSON (no copies).
 *
 * Reference sets (countries, currencies, …) are typed here but not exported as arrays — load them
 * lazily with `defineMockApi({ countries: { type: "countries-csc" } })`.
 * Exports are read-only: `defineMockApi()` copies before it stores anything.
 */
import usersSample from "../../../../datasets/users/users-sample/data.json";
import usersMock from "../../../../datasets/users/users-mock/data.json";
import productsMock from "../../../../datasets/products/products-mock/data.json";
import companiesMock from "../../../../datasets/companies/companies-mock/data.json";
import ordersMock from "../../../../datasets/orders/orders-mock/data.json";
import postsMock from "../../../../datasets/social/posts-mock/data.json";
import commentsMock from "../../../../datasets/comments/comments-mock/data.json";
import type { Comment, Company, MockUser, Order, Post, Product, User } from "./entities.js";

export type * from "./entities.js";

/** `users-sample` */
export const users: readonly User[] = usersSample;
/** `users-mock` */
export const mockUsers: readonly MockUser[] = usersMock;
/** `products-mock` */
export const products: readonly Product[] = productsMock;
/** `companies-mock` */
export const companies: readonly Company[] = companiesMock;
/** `orders-mock` */
export const orders: readonly Order[] = ordersMock;
/** `posts-mock` */
export const posts: readonly Post[] = postsMock;
/** `comments-mock` */
export const comments: readonly Comment[] = commentsMock;
