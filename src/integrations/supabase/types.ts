import type { WhatsAppChat, WhatsAppContact, WhatsAppMessage } from "@/lib/whatsappInbox";
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      whatsapp_chats: { Row: WhatsAppChat; Insert: never; Update: never; Relationships: [] }
      whatsapp_contacts: { Row: WhatsAppContact; Insert: never; Update: never; Relationships: [] }
      whatsapp_messages: { Row: WhatsAppMessage; Insert: never; Update: never; Relationships: [] }
      app_logs: {
        Row: {
          category: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          metadata: Json
          operation: string
          status: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          operation: string
          status: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          metadata?: Json
          operation?: string
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          price_snapshot: number
          product_id: string
          quantity: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          price_snapshot?: number
          product_id: string
          quantity?: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          price_snapshot?: number
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          banner_url: string
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          name_ar: string
          name_en: string
          parent_id: string | null
          show_in_carousel: boolean
          slug: string
          sort_order: number
          updated_at: string
          visible_pages: string[]
        }
        Insert: {
          banner_url?: string
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          name_ar?: string
          name_en: string
          parent_id?: string | null
          show_in_carousel?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
          visible_pages?: string[]
        }
        Update: {
          banner_url?: string
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          parent_id?: string | null
          show_in_carousel?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
          visible_pages?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string
          discount_type: Database["public"]["Enums"]["coupon_type"]
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_amount: number
          updated_at: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          discount_type: Database["public"]["Enums"]["coupon_type"]
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          discount_type?: Database["public"]["Enums"]["coupon_type"]
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          created_at: string
          cta_animation: string
          cta_font_size: number
          cta_href: string | null
          cta_label_ar: string | null
          cta_label_en: string | null
          font_family_ar: string
          font_family_en: string
          h1_animation: string
          h1_font_size: number
          h2_animation: string
          h2_font_size: number
          id: string
          is_active: boolean
          media_type: string
          media_url: string
          overlay_opacity: number
          page_key: string
          sort_order: number
          subtitle_ar: string | null
          subtitle_en: string | null
          text_align: string
          text_position_x: number
          text_position_y: number
          title_ar: string | null
          title_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_animation?: string
          cta_font_size?: number
          cta_href?: string | null
          cta_label_ar?: string | null
          cta_label_en?: string | null
          font_family_ar?: string
          font_family_en?: string
          h1_animation?: string
          h1_font_size?: number
          h2_animation?: string
          h2_font_size?: number
          id?: string
          is_active?: boolean
          media_type?: string
          media_url: string
          overlay_opacity?: number
          page_key: string
          sort_order?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          text_align?: string
          text_position_x?: number
          text_position_y?: number
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_animation?: string
          cta_font_size?: number
          cta_href?: string | null
          cta_label_ar?: string | null
          cta_label_en?: string | null
          font_family_ar?: string
          font_family_en?: string
          h1_animation?: string
          h1_font_size?: number
          h2_animation?: string
          h2_font_size?: number
          id?: string
          is_active?: boolean
          media_type?: string
          media_url?: string
          overlay_opacity?: number
          page_key?: string
          sort_order?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          text_align?: string
          text_position_x?: number
          text_position_y?: number
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          brand: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          read: boolean
          subject: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          read?: boolean
          subject?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          read?: boolean
          subject?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          brand_snapshot: string
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_image_snapshot: string
          product_name_snapshot: string
          quantity: number
          unit_price: number
        }
        Insert: {
          brand_snapshot?: string
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_id?: string | null
          product_image_snapshot?: string
          product_name_snapshot: string
          quantity: number
          unit_price: number
        }
        Update: {
          brand_snapshot?: string
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_image_snapshot?: string
          product_name_snapshot?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_line: string
          admin_notes: string
          area: string
          block: string
          building: string
          city: string
          country: string
          coupon_code: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          discount_amount: number
          failed_at: string | null
          governorate: string
          id: string
          myfatoorah_card_brand: string | null
          myfatoorah_card_last4: string | null
          myfatoorah_invoice_id: string | null
          myfatoorah_invoice_reference: string | null
          myfatoorah_payment_id: string | null
          myfatoorah_payment_url: string | null
          myfatoorah_reference_id: string | null
          myfatoorah_track_id: string | null
          myfatoorah_transaction_id: string | null
          notes: string
          order_notified_at: string | null
          order_number: string
          order_status: Database["public"]["Enums"]["order_status"]
          paid_at: string | null
          paid_notification_sent_at: string | null
          payment_amount: number | null
          payment_currency: string
          payment_error_code: string | null
          payment_error_message: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_online_method: string | null
          payment_provider: string
          payment_raw_response: Json | null
          payment_session_token_hash: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_verified_at: string | null
          street: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_line?: string
          admin_notes?: string
          area?: string
          block?: string
          building?: string
          city?: string
          country?: string
          coupon_code?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          discount_amount?: number
          failed_at?: string | null
          governorate?: string
          id?: string
          myfatoorah_card_brand?: string | null
          myfatoorah_card_last4?: string | null
          myfatoorah_invoice_id?: string | null
          myfatoorah_invoice_reference?: string | null
          myfatoorah_payment_id?: string | null
          myfatoorah_payment_url?: string | null
          myfatoorah_reference_id?: string | null
          myfatoorah_track_id?: string | null
          myfatoorah_transaction_id?: string | null
          notes?: string
          order_notified_at?: string | null
          order_number?: string
          order_status?: Database["public"]["Enums"]["order_status"]
          paid_at?: string | null
          paid_notification_sent_at?: string | null
          payment_amount?: number | null
          payment_currency?: string
          payment_error_code?: string | null
          payment_error_message?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_online_method?: string | null
          payment_provider?: string
          payment_raw_response?: Json | null
          payment_session_token_hash?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_verified_at?: string | null
          street?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_line?: string
          admin_notes?: string
          area?: string
          block?: string
          building?: string
          city?: string
          country?: string
          coupon_code?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          discount_amount?: number
          failed_at?: string | null
          governorate?: string
          id?: string
          myfatoorah_card_brand?: string | null
          myfatoorah_card_last4?: string | null
          myfatoorah_invoice_id?: string | null
          myfatoorah_invoice_reference?: string | null
          myfatoorah_payment_id?: string | null
          myfatoorah_payment_url?: string | null
          myfatoorah_reference_id?: string | null
          myfatoorah_track_id?: string | null
          myfatoorah_transaction_id?: string | null
          notes?: string
          order_notified_at?: string | null
          order_number?: string
          order_status?: Database["public"]["Enums"]["order_status"]
          paid_at?: string | null
          paid_notification_sent_at?: string | null
          payment_amount?: number | null
          payment_currency?: string
          payment_error_code?: string | null
          payment_error_message?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_online_method?: string | null
          payment_provider?: string
          payment_raw_response?: Json | null
          payment_session_token_hash?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_verified_at?: string | null
          street?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          error_message: string | null
          id: string
          idempotency_key: string
          invoice_id: string | null
          order_id: string | null
          payment_id: string | null
          payment_method: string | null
          payment_url: string | null
          provider: string
          request_payload: Json | null
          response_payload: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          order_id?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_url?: string | null
          provider?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          order_id?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_url?: string | null
          provider?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_reference: string | null
          event_source: string
          event_type: string | null
          id: string
          invoice_id: string | null
          is_success: boolean | null
          order_id: string | null
          payment_id: string | null
          processed: boolean | null
          processing_error: string | null
          provider: string
          raw_payload: Json | null
          signature_valid: boolean | null
          status: string | null
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          event_reference?: string | null
          event_source: string
          event_type?: string | null
          id?: string
          invoice_id?: string | null
          is_success?: boolean | null
          order_id?: string | null
          payment_id?: string | null
          processed?: boolean | null
          processing_error?: string | null
          provider?: string
          raw_payload?: Json | null
          signature_valid?: boolean | null
          status?: string | null
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          event_reference?: string | null
          event_source?: string
          event_type?: string | null
          id?: string
          invoice_id?: string | null
          is_success?: boolean | null
          order_id?: string | null
          payment_id?: string | null
          processed?: boolean | null
          processing_error?: string | null
          provider?: string
          raw_payload?: Json | null
          signature_valid?: boolean | null
          status?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string
          created_at: string
          id: string
          is_approved: boolean
          product_id: string
          rating: number
          reviewer_email: string | null
          reviewer_name: string
        }
        Insert: {
          comment?: string
          created_at?: string
          id?: string
          is_approved?: boolean
          product_id: string
          rating: number
          reviewer_email?: string | null
          reviewer_name: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          is_approved?: boolean
          product_id?: string
          rating?: number
          reviewer_email?: string | null
          reviewer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          benefits: string[]
          benefits_ar: string[]
          brand: Database["public"]["Enums"]["brand_key"]
          category: string
          category_ar: string
          category_id: string | null
          created_at: string
          featured: boolean
          gallery: string[]
          id: string
          ingredients: string[]
          ingredients_ar: string[]
          long_description: string
          long_description_ar: string
          main_image: string
          name: string
          name_ar: string
          original_price: number | null
          price: number
          short_description: string
          short_description_ar: string
          size: string
          sku: string
          slug: string
          source_url: string
          stock_status: Database["public"]["Enums"]["stock_status"]
          tags: string[]
          updated_at: string
          usage: string
          usage_ar: string
        }
        Insert: {
          benefits?: string[]
          benefits_ar?: string[]
          brand: Database["public"]["Enums"]["brand_key"]
          category?: string
          category_ar?: string
          category_id?: string | null
          created_at?: string
          featured?: boolean
          gallery?: string[]
          id?: string
          ingredients?: string[]
          ingredients_ar?: string[]
          long_description?: string
          long_description_ar?: string
          main_image?: string
          name: string
          name_ar?: string
          original_price?: number | null
          price?: number
          short_description?: string
          short_description_ar?: string
          size?: string
          sku: string
          slug: string
          source_url?: string
          stock_status?: Database["public"]["Enums"]["stock_status"]
          tags?: string[]
          updated_at?: string
          usage?: string
          usage_ar?: string
        }
        Update: {
          benefits?: string[]
          benefits_ar?: string[]
          brand?: Database["public"]["Enums"]["brand_key"]
          category?: string
          category_ar?: string
          category_id?: string | null
          created_at?: string
          featured?: boolean
          gallery?: string[]
          id?: string
          ingredients?: string[]
          ingredients_ar?: string[]
          long_description?: string
          long_description_ar?: string
          main_image?: string
          name?: string
          name_ar?: string
          original_price?: number | null
          price?: number
          short_description?: string
          short_description_ar?: string
          size?: string
          sku?: string
          slug?: string
          source_url?: string
          stock_status?: Database["public"]["Enums"]["stock_status"]
          tags?: string[]
          updated_at?: string
          usage?: string
          usage_ar?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line: string
          area: string
          avatar_url: string
          block: string
          building: string
          city: string
          country: string
          created_at: string
          full_name: string
          governorate: string
          id: string
          is_blocked: boolean
          notes: string
          phone: string
          street: string
          updated_at: string
        }
        Insert: {
          address_line?: string
          area?: string
          avatar_url?: string
          block?: string
          building?: string
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          governorate?: string
          id: string
          is_blocked?: boolean
          notes?: string
          phone?: string
          street?: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          area?: string
          avatar_url?: string
          block?: string
          building?: string
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          governorate?: string
          id?: string
          is_blocked?: boolean
          notes?: string
          phone?: string
          street?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          created_at: string
          gender: string
          id: string
          is_active: boolean
          location: string
          name_ar: string
          name_en: string
          quote_ar: string
          quote_en: string
          role_ar: string
          role_en: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          gender?: string
          id?: string
          is_active?: boolean
          location?: string
          name_ar?: string
          name_en?: string
          quote_ar?: string
          quote_en?: string
          role_ar?: string
          role_en?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          gender?: string
          id?: string
          is_active?: boolean
          location?: string
          name_ar?: string
          name_en?: string
          quote_ar?: string
          quote_en?: string
          role_ar?: string
          role_en?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_notification_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_send_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event: string
          id: string
          order_id: string | null
          recipient: string
          request_payload: Json
          response_payload: Json
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          order_id?: string | null
          recipient: string
          request_payload?: Json
          response_payload?: Json
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          order_id?: string | null
          recipient?: string
          request_payload?: Json
          response_payload?: Json
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coupon_usage: { Args: { _code: string }; Returns: undefined }
      next_order_number: { Args: never; Returns: string }
      slugify: { Args: { _input: string }; Returns: string }
      validate_coupon: {
        Args: { _code: string; _subtotal: number }
        Returns: {
          coupon_id: string
          discount: number
          discount_type: string
          discount_value: number
          min_order_amount: number
          ok: boolean
          reason: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      brand_key:
        | "flexitol"
        | "kapiva"
        | "nada"
        | "abc"
        | "lafes"
        | "hartington"
        | "phytophar"
        | "hualunhongli"
      coupon_type: "percent" | "fixed"
      notification_type: "order" | "system" | "message"
      order_status:
        | "new"
        | "confirmed"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
      payment_method: "pay_by_link" | "cod"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "pending_payment"
        | "payment_failed"
        | "payment_cancelled"
        | "payment_expired"
        | "pending_status_update"
        | "partially_refunded"
      stock_status: "in_stock" | "low_stock" | "out_of_stock"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      brand_key: [
        "flexitol",
        "kapiva",
        "nada",
        "abc",
        "lafes",
        "hartington",
        "phytophar",
        "hualunhongli",
      ],
      coupon_type: ["percent", "fixed"],
      notification_type: ["order", "system", "message"],
      order_status: [
        "new",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      payment_method: ["pay_by_link", "cod"],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "pending_payment",
        "payment_failed",
        "payment_cancelled",
        "payment_expired",
        "pending_status_update",
        "partially_refunded",
      ],
      stock_status: ["in_stock", "low_stock", "out_of_stock"],
    },
  },
} as const
