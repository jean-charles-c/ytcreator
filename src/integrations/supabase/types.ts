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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      custom_pronunciations: {
        Row: {
          created_at: string
          id: string
          phrase: string
          pronunciation: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phrase: string
          pronunciation: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phrase?: string
          pronunciation?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_tts_transforms: {
        Row: {
          created_at: string
          id: string
          is_exception: boolean
          pattern: string
          replacement: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_exception?: boolean
          pattern: string
          replacement: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_exception?: boolean
          pattern?: string
          replacement?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      external_uploads: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          label: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          label?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          label?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_voice_profile: {
        Row: {
          created_at: string | null
          dynamic_pause_enabled: boolean
          dynamic_pause_variation: number
          effects_profile_id: string
          id: string
          language_code: string
          narration_profile: string
          pause_after_comma: number
          pause_after_sentences: number
          pause_between_paragraphs: number
          pitch: number
          profile_name: string
          sentence_end_slow: number
          sentence_start_boost: number
          speaking_rate: number
          style: string
          updated_at: string | null
          user_id: string
          voice_gender: string
          voice_name: string
          volume_gain_db: number
        }
        Insert: {
          created_at?: string | null
          dynamic_pause_enabled?: boolean
          dynamic_pause_variation?: number
          effects_profile_id?: string
          id?: string
          language_code?: string
          narration_profile?: string
          pause_after_comma?: number
          pause_after_sentences?: number
          pause_between_paragraphs?: number
          pitch?: number
          profile_name?: string
          sentence_end_slow?: number
          sentence_start_boost?: number
          speaking_rate?: number
          style?: string
          updated_at?: string | null
          user_id: string
          voice_gender?: string
          voice_name?: string
          volume_gain_db?: number
        }
        Update: {
          created_at?: string | null
          dynamic_pause_enabled?: boolean
          dynamic_pause_variation?: number
          effects_profile_id?: string
          id?: string
          language_code?: string
          narration_profile?: string
          pause_after_comma?: number
          pause_after_sentences?: number
          pause_between_paragraphs?: number
          pitch?: number
          profile_name?: string
          sentence_end_slow?: number
          sentence_start_boost?: number
          speaking_rate?: number
          style?: string
          updated_at?: string | null
          user_id?: string
          voice_gender?: string
          voice_name?: string
          volume_gain_db?: number
        }
        Relationships: []
      }
      generated_projects: {
        Row: {
          analysis_id: string | null
          created_at: string
          form_id: string | null
          id: string
          pitch_id: string | null
          project_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          form_id?: string | null
          id?: string
          pitch_id?: string | null
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          form_id?: string | null
          id?: string
          pitch_id?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_projects_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "narrative_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_projects_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "narrative_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_projects_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "story_pitches"
            referencedColumns: ["id"]
          },
        ]
      }
      kie_pricing: {
        Row: {
          created_at: string
          currency: string
          endpoint_path: string
          id: string
          is_active: boolean
          kie_slug: string | null
          last_synced_at: string | null
          modality: string
          model_id: string
          model_label: string
          notes: string | null
          price_usd: number
          quality: string
          supports_image_input: boolean
          supports_oref: boolean
          supports_sref: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          endpoint_path?: string
          id?: string
          is_active?: boolean
          kie_slug?: string | null
          last_synced_at?: string | null
          modality?: string
          model_id: string
          model_label: string
          notes?: string | null
          price_usd?: number
          quality: string
          supports_image_input?: boolean
          supports_oref?: boolean
          supports_sref?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          endpoint_path?: string
          id?: string
          is_active?: boolean
          kie_slug?: string | null
          last_synced_at?: string | null
          modality?: string
          model_id?: string
          model_label?: string
          notes?: string | null
          price_usd?: number
          quality?: string
          supports_image_input?: boolean
          supports_oref?: boolean
          supports_sref?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      music_history: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          file_name: string
          file_path: string
          file_size: number | null
          genre: string | null
          id: string
          mood: string | null
          project_id: string
          prompt: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          file_name: string
          file_path: string
          file_size?: number | null
          genre?: string | null
          id?: string
          mood?: string | null
          project_id: string
          prompt: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          genre?: string | null
          id?: string
          mood?: string | null
          project_id?: string
          prompt?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      music_settings: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          prompt: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          prompt?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          prompt?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      narrative_analyses: {
        Row: {
          ai_model: string | null
          created_at: string
          error_message: string | null
          id: string
          patterns: Json | null
          recommendations: Json | null
          rhythm: Json | null
          source_ids: string[]
          status: string
          structure: Json | null
          summary: string | null
          title: string | null
          tone: Json | null
          updated_at: string
          user_id: string
          writing_rules: Json | null
        }
        Insert: {
          ai_model?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          patterns?: Json | null
          recommendations?: Json | null
          rhythm?: Json | null
          source_ids?: string[]
          status?: string
          structure?: Json | null
          summary?: string | null
          title?: string | null
          tone?: Json | null
          updated_at?: string
          user_id: string
          writing_rules?: Json | null
        }
        Update: {
          ai_model?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          patterns?: Json | null
          recommendations?: Json | null
          rhythm?: Json | null
          source_ids?: string[]
          status?: string
          structure?: Json | null
          summary?: string | null
          title?: string | null
          tone?: Json | null
          updated_at?: string
          user_id?: string
          writing_rules?: Json | null
        }
        Relationships: []
      }
      narrative_chapters: {
        Row: {
          chapter_order: number
          created_at: string
          dramatic_tension: string | null
          emotional_progression: string | null
          estimated_duration_seconds: number | null
          id: string
          intention: string | null
          main_event: string | null
          outline_id: string
          revelation: string | null
          structural_role: string | null
          summary: string | null
          title: string
          transition_to_next: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_order?: number
          created_at?: string
          dramatic_tension?: string | null
          emotional_progression?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          intention?: string | null
          main_event?: string | null
          outline_id: string
          revelation?: string | null
          structural_role?: string | null
          summary?: string | null
          title: string
          transition_to_next?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_order?: number
          created_at?: string
          dramatic_tension?: string | null
          emotional_progression?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          intention?: string | null
          main_event?: string | null
          outline_id?: string
          revelation?: string | null
          structural_role?: string | null
          summary?: string | null
          title?: string
          transition_to_next?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_chapters_outline_id_fkey"
            columns: ["outline_id"]
            isOneToOne: false
            referencedRelation: "narrative_outlines"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_forms: {
        Row: {
          analysis_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          narrative_signature: Json | null
          status: string
          system_prompt: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          narrative_signature?: Json | null
          status?: string
          system_prompt?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          narrative_signature?: Json | null
          status?: string
          system_prompt?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_forms_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "narrative_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_outlines: {
        Row: {
          ai_model: string | null
          created_at: string
          form_id: string | null
          id: string
          intention: string | null
          pitch_id: string | null
          project_id: string
          status: string
          target_duration_seconds: number | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          created_at?: string
          form_id?: string | null
          id?: string
          intention?: string | null
          pitch_id?: string | null
          project_id: string
          status?: string
          target_duration_seconds?: number | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_model?: string | null
          created_at?: string
          form_id?: string | null
          id?: string
          intention?: string | null
          pitch_id?: string | null
          project_id?: string
          status?: string
          target_duration_seconds?: number | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      narrative_scenes: {
        Row: {
          ai_model: string | null
          chapter_id: string
          characters: Json
          content: string
          created_at: string
          dominant_emotion: string | null
          generation_index: number
          id: string
          locations: Json
          narrative_role: string | null
          objects: Json
          outline_id: string | null
          project_id: string
          scene_context: Json | null
          scene_order: number
          status: string
          summary: string | null
          title: string | null
          transition_to_next: string | null
          updated_at: string
          user_id: string
          validated: boolean
          visual_intention: string | null
          voice_over_text: string | null
        }
        Insert: {
          ai_model?: string | null
          chapter_id: string
          characters?: Json
          content?: string
          created_at?: string
          dominant_emotion?: string | null
          generation_index?: number
          id?: string
          locations?: Json
          narrative_role?: string | null
          objects?: Json
          outline_id?: string | null
          project_id: string
          scene_context?: Json | null
          scene_order?: number
          status?: string
          summary?: string | null
          title?: string | null
          transition_to_next?: string | null
          updated_at?: string
          user_id: string
          validated?: boolean
          visual_intention?: string | null
          voice_over_text?: string | null
        }
        Update: {
          ai_model?: string | null
          chapter_id?: string
          characters?: Json
          content?: string
          created_at?: string
          dominant_emotion?: string | null
          generation_index?: number
          id?: string
          locations?: Json
          narrative_role?: string | null
          objects?: Json
          outline_id?: string | null
          project_id?: string
          scene_context?: Json | null
          scene_order?: number
          status?: string
          summary?: string | null
          title?: string | null
          transition_to_next?: string | null
          updated_at?: string
          user_id?: string
          validated?: boolean
          visual_intention?: string | null
          voice_over_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "narrative_scenes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "narrative_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_sources: {
        Row: {
          channel: string | null
          created_at: string
          duration_seconds: number | null
          fetch_status: string
          id: string
          language: string | null
          notes: string | null
          status: string
          title: string | null
          transcript: string | null
          transcript_source: string
          updated_at: string
          user_id: string
          youtube_url: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          fetch_status?: string
          id?: string
          language?: string | null
          notes?: string | null
          status?: string
          title?: string | null
          transcript?: string | null
          transcript_source?: string
          updated_at?: string
          user_id: string
          youtube_url?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          fetch_status?: string
          id?: string
          language?: string | null
          notes?: string | null
          status?: string
          title?: string | null
          transcript?: string | null
          transcript_source?: string
          updated_at?: string
          user_id?: string
          youtube_url?: string | null
        }
        Relationships: []
      }
      pitch_batches: {
        Row: {
          ai_model: string | null
          analysis_id: string | null
          batch_index: number
          created_at: string
          form_id: string | null
          id: string
          instructions: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          analysis_id?: string | null
          batch_index?: number
          created_at?: string
          form_id?: string | null
          id?: string
          instructions?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_model?: string | null
          analysis_id?: string | null
          batch_index?: number
          created_at?: string
          form_id?: string | null
          id?: string
          instructions?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_batches_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "narrative_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_batches_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "narrative_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      project_groups: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_scriptcreator_state: {
        Row: {
          analysis: Json | null
          created_at: string
          doc_structure: Json | null
          extracted_text: string | null
          file_name: string | null
          generated_script: string | null
          global_context: Json | null
          intention_note: string | null
          narrative_form: string | null
          page_count: number
          project_id: string
          scene_versions: Json | null
          script_v2_raw: string | null
          script_v2_revised: string | null
          script_versions: Json | null
          seo_results: Json | null
          shot_versions: Json | null
          timeline_state: Json | null
          updated_at: string
          v2_enabled: boolean | null
          visual_style_global: string | null
        }
        Insert: {
          analysis?: Json | null
          created_at?: string
          doc_structure?: Json | null
          extracted_text?: string | null
          file_name?: string | null
          generated_script?: string | null
          global_context?: Json | null
          intention_note?: string | null
          narrative_form?: string | null
          page_count?: number
          project_id: string
          scene_versions?: Json | null
          script_v2_raw?: string | null
          script_v2_revised?: string | null
          script_versions?: Json | null
          seo_results?: Json | null
          shot_versions?: Json | null
          timeline_state?: Json | null
          updated_at?: string
          v2_enabled?: boolean | null
          visual_style_global?: string | null
        }
        Update: {
          analysis?: Json | null
          created_at?: string
          doc_structure?: Json | null
          extracted_text?: string | null
          file_name?: string | null
          generated_script?: string | null
          global_context?: Json | null
          intention_note?: string | null
          narrative_form?: string | null
          page_count?: number
          project_id?: string
          scene_versions?: Json | null
          script_v2_raw?: string | null
          script_v2_revised?: string | null
          script_versions?: Json | null
          seo_results?: Json | null
          shot_versions?: Json | null
          timeline_state?: Json | null
          updated_at?: string
          v2_enabled?: boolean | null
          visual_style_global?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_scriptcreator_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          image_engine: string | null
          image_quality: string | null
          narration: string | null
          scene_count: number
          script_language: string
          status: Database["public"]["Enums"]["project_status"]
          subject: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          image_engine?: string | null
          image_quality?: string | null
          narration?: string | null
          scene_count?: number
          script_language?: string
          status?: Database["public"]["Enums"]["project_status"]
          subject?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          image_engine?: string | null
          image_quality?: string | null
          narration?: string | null
          scene_count?: number
          script_language?: string
          status?: Database["public"]["Enums"]["project_status"]
          subject?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "project_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      research_dossiers: {
        Row: {
          angle: string | null
          content: string
          created_at: string
          depth: string
          id: string
          instructions: string | null
          project_id: string
          topic: string
          user_id: string
        }
        Insert: {
          angle?: string | null
          content?: string
          created_at?: string
          depth?: string
          id?: string
          instructions?: string | null
          project_id: string
          topic: string
          user_id: string
        }
        Update: {
          angle?: string | null
          content?: string
          created_at?: string
          depth?: string
          id?: string
          instructions?: string | null
          project_id?: string
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_dossiers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_vo_audio: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          project_id: string
          sample_rate: number | null
          scene_id: string
          scene_order: number
          speaking_rate: number | null
          text_hash: string | null
          user_id: string
          voice_name: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          project_id: string
          sample_rate?: number | null
          scene_id: string
          scene_order: number
          speaking_rate?: number | null
          text_hash?: string | null
          user_id: string
          voice_name?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          project_id?: string
          sample_rate?: number | null
          scene_id?: string
          scene_order?: number
          speaking_rate?: number | null
          text_hash?: string | null
          user_id?: string
          voice_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_vo_audio_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_vo_audio_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          characters: string | null
          continuity: string | null
          created_at: string
          id: string
          image_engine: string | null
          image_quality: string | null
          location: string | null
          narrative_action: string | null
          project_id: string
          scene_context: Json | null
          scene_order: number
          scene_type: string | null
          source_text: string
          source_text_fr: string | null
          title: string
          updated_at: string
          validated: boolean
          visual_intention: string | null
        }
        Insert: {
          characters?: string | null
          continuity?: string | null
          created_at?: string
          id?: string
          image_engine?: string | null
          image_quality?: string | null
          location?: string | null
          narrative_action?: string | null
          project_id: string
          scene_context?: Json | null
          scene_order: number
          scene_type?: string | null
          source_text: string
          source_text_fr?: string | null
          title: string
          updated_at?: string
          validated?: boolean
          visual_intention?: string | null
        }
        Update: {
          characters?: string | null
          continuity?: string | null
          created_at?: string
          id?: string
          image_engine?: string | null
          image_quality?: string | null
          location?: string | null
          narrative_action?: string | null
          project_id?: string
          scene_context?: Json | null
          scene_order?: number
          scene_type?: string | null
          source_text?: string
          source_text_fr?: string | null
          title?: string
          updated_at?: string
          validated?: boolean
          visual_intention?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          created_at: string
          description: string
          generation_cost: number
          guardrails: string | null
          id: string
          image_engine: string | null
          image_quality: string | null
          image_url: string | null
          project_id: string
          prompt_export: string | null
          scene_id: string
          shot_order: number
          shot_type: string
          source_sentence: string | null
          source_sentence_fr: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          generation_cost?: number
          guardrails?: string | null
          id?: string
          image_engine?: string | null
          image_quality?: string | null
          image_url?: string | null
          project_id: string
          prompt_export?: string | null
          scene_id: string
          shot_order: number
          shot_type: string
          source_sentence?: string | null
          source_sentence_fr?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          generation_cost?: number
          guardrails?: string | null
          id?: string
          image_engine?: string | null
          image_quality?: string | null
          image_url?: string | null
          project_id?: string
          prompt_export?: string | null
          scene_id?: string
          shot_order?: number
          shot_type?: string
          source_sentence?: string | null
          source_sentence_fr?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      story_pitches: {
        Row: {
          angle: string | null
          central_tension: string | null
          concept: string | null
          created_at: string
          dominant_emotion: string | null
          estimated_format: string | null
          form_compliance_justification: string | null
          hook: string | null
          id: string
          narrative_promise: string | null
          pitch_batch_id: string
          pitch_order: number
          point_of_view: string | null
          progression: string | null
          status: string
          synopsis: string | null
          target_audience: string | null
          theme: string | null
          title: string
          tone: string | null
          twists: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          angle?: string | null
          central_tension?: string | null
          concept?: string | null
          created_at?: string
          dominant_emotion?: string | null
          estimated_format?: string | null
          form_compliance_justification?: string | null
          hook?: string | null
          id?: string
          narrative_promise?: string | null
          pitch_batch_id: string
          pitch_order?: number
          point_of_view?: string | null
          progression?: string | null
          status?: string
          synopsis?: string | null
          target_audience?: string | null
          theme?: string | null
          title: string
          tone?: string | null
          twists?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          angle?: string | null
          central_tension?: string | null
          concept?: string | null
          created_at?: string
          dominant_emotion?: string | null
          estimated_format?: string | null
          form_compliance_justification?: string | null
          hook?: string | null
          id?: string
          narrative_promise?: string | null
          pitch_batch_id?: string
          pitch_order?: number
          point_of_view?: string | null
          progression?: string | null
          status?: string
          synopsis?: string | null
          target_audience?: string | null
          theme?: string | null
          title?: string
          tone?: string | null
          twists?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_pitches_pitch_batch_id_fkey"
            columns: ["pitch_batch_id"]
            isOneToOne: false
            referencedRelation: "pitch_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      video_generations: {
        Row: {
          aspect_ratio: string
          created_at: string
          duration_sec: number
          error_message: string | null
          estimated_cost_usd: number | null
          generation_time_ms: number | null
          id: string
          negative_prompt: string
          project_id: string
          prompt_used: string
          provider: string
          provider_job_id: string | null
          provider_metadata: Json | null
          result_thumbnail_url: string | null
          result_video_url: string | null
          selected_for_export: boolean
          source_image_url: string
          source_shot_id: string | null
          source_type: string
          source_upload_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          duration_sec?: number
          error_message?: string | null
          estimated_cost_usd?: number | null
          generation_time_ms?: number | null
          id?: string
          negative_prompt?: string
          project_id: string
          prompt_used?: string
          provider?: string
          provider_job_id?: string | null
          provider_metadata?: Json | null
          result_thumbnail_url?: string | null
          result_video_url?: string | null
          selected_for_export?: boolean
          source_image_url: string
          source_shot_id?: string | null
          source_type?: string
          source_upload_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          duration_sec?: number
          error_message?: string | null
          estimated_cost_usd?: number | null
          generation_time_ms?: number | null
          id?: string
          negative_prompt?: string
          project_id?: string
          prompt_used?: string
          provider?: string
          provider_job_id?: string | null
          provider_metadata?: Json | null
          result_thumbnail_url?: string | null
          result_video_url?: string | null
          selected_for_export?: boolean
          source_image_url?: string
          source_shot_id?: string | null
          source_type?: string
          source_upload_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generations_source_shot_id_fkey"
            columns: ["source_shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generations_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "external_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      video_prompt_variants: {
        Row: {
          created_at: string
          id: string
          label: string
          negative_prompt: string
          overrides: Json
          parent_id: string
          prompt: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          negative_prompt?: string
          overrides?: Json
          parent_id: string
          prompt?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          negative_prompt?: string
          overrides?: Json
          parent_id?: string
          prompt?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_prompt_variants_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "video_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_prompts: {
        Row: {
          aspect_ratio: string
          camera_movement: string
          created_at: string
          display_order: number
          duration_sec: number
          id: string
          is_manually_edited: boolean
          mood: string
          narrative_fragment: string
          negative_prompt: string
          profile_id: string | null
          project_id: string
          prompt: string
          render_constraints: string
          scene_motion: string
          scene_title: string
          source: string
          source_scene_id: string | null
          source_shot_id: string | null
          status: string
          style: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string
          camera_movement?: string
          created_at?: string
          display_order?: number
          duration_sec?: number
          id?: string
          is_manually_edited?: boolean
          mood?: string
          narrative_fragment?: string
          negative_prompt?: string
          profile_id?: string | null
          project_id: string
          prompt?: string
          render_constraints?: string
          scene_motion?: string
          scene_title?: string
          source?: string
          source_scene_id?: string | null
          source_shot_id?: string | null
          status?: string
          style?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          camera_movement?: string
          created_at?: string
          display_order?: number
          duration_sec?: number
          id?: string
          is_manually_edited?: boolean
          mood?: string
          narrative_fragment?: string
          negative_prompt?: string
          profile_id?: string | null
          project_id?: string
          prompt?: string
          render_constraints?: string
          scene_motion?: string
          scene_title?: string
          source?: string
          source_scene_id?: string | null
          source_shot_id?: string | null
          status?: string
          style?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_prompts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "video_settings_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_settings_profiles: {
        Row: {
          aspect_ratio: string
          camera_movement: string
          created_at: string
          duration_sec: number
          id: string
          is_default: boolean
          mood: string
          name: string
          negative_prompt: string
          project_id: string
          render_constraints: string
          scene_motion: string
          style: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string
          camera_movement?: string
          created_at?: string
          duration_sec?: number
          id?: string
          is_default?: boolean
          mood?: string
          name?: string
          negative_prompt?: string
          project_id: string
          render_constraints?: string
          scene_motion?: string
          style?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          camera_movement?: string
          created_at?: string
          duration_sec?: number
          id?: string
          is_default?: boolean
          mood?: string
          name?: string
          negative_prompt?: string
          project_id?: string
          render_constraints?: string
          scene_motion?: string
          style?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_settings_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vo_audio_history: {
        Row: {
          created_at: string | null
          duration_estimate: number | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          language_code: string
          project_id: string
          shot_timepoints: Json | null
          speaking_rate: number | null
          style: string | null
          text_length: number | null
          user_id: string
          voice_gender: string
          whisper_words: Json | null
        }
        Insert: {
          created_at?: string | null
          duration_estimate?: number | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          language_code?: string
          project_id: string
          shot_timepoints?: Json | null
          speaking_rate?: number | null
          style?: string | null
          text_length?: number | null
          user_id: string
          voice_gender?: string
          whisper_words?: Json | null
        }
        Update: {
          created_at?: string | null
          duration_estimate?: number | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          language_code?: string
          project_id?: string
          shot_timepoints?: Json | null
          speaking_rate?: number | null
          style?: string | null
          text_length?: number | null
          user_id?: string
          voice_gender?: string
          whisper_words?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "vo_audio_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      voiceover_scripts: {
        Row: {
          content: string
          created_at: string
          estimated_duration_seconds: number | null
          id: string
          outline_id: string | null
          project_id: string
          sent_to_scriptcreator_at: string | null
          sent_to_segmentation_at: string | null
          status: string
          updated_at: string
          user_id: string
          word_count: number
        }
        Insert: {
          content?: string
          created_at?: string
          estimated_duration_seconds?: number | null
          id?: string
          outline_id?: string | null
          project_id: string
          sent_to_scriptcreator_at?: string | null
          sent_to_segmentation_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          word_count?: number
        }
        Update: {
          content?: string
          created_at?: string
          estimated_duration_seconds?: number | null
          id?: string
          outline_id?: string | null
          project_id?: string
          sent_to_scriptcreator_at?: string | null
          sent_to_segmentation_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "voiceover_scripts_outline_id_fkey"
            columns: ["outline_id"]
            isOneToOne: false
            referencedRelation: "narrative_outlines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      project_status: "draft" | "segmented" | "storyboarded" | "exported"
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
      project_status: ["draft", "segmented", "storyboarded", "exported"],
    },
  },
} as const
