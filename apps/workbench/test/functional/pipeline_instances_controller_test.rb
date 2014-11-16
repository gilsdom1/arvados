require 'test_helper'

class PipelineInstancesControllerTest < ActionController::TestCase
  def create_instance_long_enough_to(instance_attrs={})
    # create 'two_part' pipeline with the given instance attributes
    pt_fixture = api_fixture('pipeline_templates')['two_part']
    post :create, {
      pipeline_instance: instance_attrs.merge({
        pipeline_template_uuid: pt_fixture['uuid']
      }),
      format: :json
    }, session_for(:active)
    assert_response :success
    pi_uuid = assigns(:object).uuid
    assert_not_nil assigns(:object)

    # yield
    yield pi_uuid, pt_fixture

    # delete the pipeline instance
    use_token :active
    PipelineInstance.where(uuid: pi_uuid).first.destroy
  end

  test "pipeline instance components populated after create" do
    create_instance_long_enough_to do |new_instance_uuid, template_fixture|
      assert_equal(template_fixture['components'].to_json,
                   assigns(:object).components.to_json)
    end
  end

  test "can render pipeline instance with tagged collections" do
    # Make sure to pass in a tagged collection to test that part of the rendering behavior.
    get(:show,
        {id: api_fixture("pipeline_instances")["pipeline_with_tagged_collection_input"]["uuid"]},
        session_for(:active))
    assert_response :success
  end

  test "update script_parameters one at a time using merge param" do
      template_fixture = api_fixture('pipeline_templates')['two_part']
      post :update, {
        id: api_fixture("pipeline_instances")["pipeline_to_merge_params"]["uuid"],
        pipeline_instance: {
          components: {
            "part-two" => {
              script_parameters: {
                integer_with_value: {
                  value: 9
                },
                plain_string: {
                  value: 'quux'
                },
              }
            }
          }
        },
        merge: true,
        format: :json
      }, session_for(:active)
      assert_response :success
      assert_not_nil assigns(:object)
      orig_params = template_fixture['components']['part-two']['script_parameters']
      new_params = assigns(:object).components[:'part-two'][:script_parameters]
      orig_params.keys.each do |k|
        unless %w(integer_with_value plain_string).index(k)
          assert_equal orig_params[k].to_json, new_params[k.to_sym].to_json
        end
      end
  end

  test "component rendering copes with unexpected components format" do
    get(:show,
        {id: api_fixture("pipeline_instances")["components_is_jobspec"]["uuid"]},
        session_for(:active))
    assert_response :success
  end

  test "dates in JSON components are parsed" do
    get(:show,
        {id: api_fixture('pipeline_instances')['has_component_with_completed_jobs']['uuid']},
        session_for(:active))
    assert_response :success
    assert_not_nil assigns(:object)
    assert_not_nil assigns(:object).components[:foo][:job]
    assert assigns(:object).components[:foo][:job][:started_at].is_a? Time
    assert assigns(:object).components[:foo][:job][:finished_at].is_a? Time
  end

  # The next two tests ensure that a pipeline instance can be copied
  # when the template has components that do not exist in the
  # instance (ticket #4000).

  test "copy pipeline instance with components=use_latest" do
    post(:copy,
         {
           id: api_fixture('pipeline_instances')['pipeline_with_newer_template']['uuid'],
           components: 'use_latest',
           script: 'use_latest',
           pipeline_instance: {
             state: 'RunningOnServer'
           }
         },
         session_for(:active))
    assert_response 302
    assert_not_nil assigns(:object)

    # Component 'foo' has script parameters only in the pipeline instance.
    # Component 'bar' is present only in the pipeline_template.
    # Test that the copied pipeline instance includes parameters for
    # component 'foo' from the source instance, and parameters for
    # component 'bar' from the source template.
    #
    assert_not_nil assigns(:object).components[:foo]
    foo = assigns(:object).components[:foo]
    assert_not_nil foo[:script_parameters]
    assert_not_nil foo[:script_parameters][:input]
    assert_equal 'foo instance input', foo[:script_parameters][:input][:title]

    assert_not_nil assigns(:object).components[:bar]
    bar = assigns(:object).components[:bar]
    assert_not_nil bar[:script_parameters]
    assert_not_nil bar[:script_parameters][:input]
    assert_equal 'bar template input', bar[:script_parameters][:input][:title]
  end

  test "copy pipeline instance on newer template works with script=use_same" do
    post(:copy,
         {
           id: api_fixture('pipeline_instances')['pipeline_with_newer_template']['uuid'],
           components: 'use_latest',
           script: 'use_same',
           pipeline_instance: {
             state: 'RunningOnServer'
           }
         },
         session_for(:active))
    assert_response 302
    assert_not_nil assigns(:object)

    # Test that relevant component parameters were copied from both
    # the source instance and source template, respectively (see
    # previous test)
    #
    assert_not_nil assigns(:object).components[:foo]
    foo = assigns(:object).components[:foo]
    assert_not_nil foo[:script_parameters]
    assert_not_nil foo[:script_parameters][:input]
    assert_equal 'foo instance input', foo[:script_parameters][:input][:title]

    assert_not_nil assigns(:object).components[:bar]
    bar = assigns(:object).components[:bar]
    assert_not_nil bar[:script_parameters]
    assert_not_nil bar[:script_parameters][:input]
    assert_equal 'bar template input', bar[:script_parameters][:input][:title]
  end
end
